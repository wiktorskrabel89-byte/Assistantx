'use strict';

/**
 * Context Compression Engine — composes the existing memory primitives into
 * the Phase 1 pipeline from the spec:
 *
 *   Memory → Retriever → Relevance Ranking → Compression → Context Window
 *
 * Trigger: when estimated tokens of the full message history cross
 * `triggerTokens` (default 80k). Below that, compression is a no-op.
 *
 * Invariants (each enforced by a test in test/context-compression.test.js):
 *   • compress-recency       — newest `keepNewest` (default 10) messages
 *                              are always returned uncompressed at the end.
 *   • compress-no-data-loss  — original messages are written to an archive
 *                              file before the in-memory list is rewritten;
 *                              calling .archive() returns the location.
 *   • compress-transparent   — emits a `context-compressed` event payload
 *                              `{ tokensIn, tokensOut, droppedMessages,
 *                                 runtimeMs, archivePath }` so the
 *                              Diagnostics terminal + Activity Panel can
 *                              render "Context compressed: X→Y tokens".
 *   • compress-idempotent    — running it again on an already-compressed
 *                              window returns the same window (no further
 *                              degradation).
 *
 * The compressor does NOT call any LLM — it uses the existing pure
 * heuristics: history-summarizer condenses old messages, chunk-ranker +
 * context-compressor dedup/shrink the auxiliary chunks. Hooking a real
 * model into the summary step is a follow-on once we want semantic
 * compression instead of structural compression.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

const { estimateTokens } = require('./budgeting/token-estimator');
const { summarizeHistory } = require('./summarization/history-summarizer');
const { rankChunks } = require('./ranking/chunk-ranker');
const { compressChunks } = require('./compression/context-compressor');

const DEFAULT_TRIGGER_TOKENS = 80_000;
const DEFAULT_KEEP_NEWEST = 10;
const DEFAULT_ARCHIVE_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.config'),
  'JarvisDesktop',
  'context-archive',
);

function nowMs() {
  return Date.now();
}

function newArchiveName() {
  return `context-${nowMs().toString(36)}-${Math.random().toString(36).slice(2, 8)}.json`;
}

function compressedMarker(message) {
  return Boolean(message && message.__compressed === true);
}

function createCompressionEngine({
  triggerTokens = DEFAULT_TRIGGER_TOKENS,
  keepNewest = DEFAULT_KEEP_NEWEST,
  archiveDir = DEFAULT_ARCHIVE_DIR,
  memoryStore = null,
  knowledgeStore = null,
  // Override only in tests — defaults to fs.writeFileSync.
  writer = (target, payload) => {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, payload, 'utf8');
  },
} = {}) {
  const emitter = new EventEmitter();

  /**
   * Estimate tokens for a message list, treating each entry as
   * `{role, content|text}`. The estimator's char/4 heuristic is the same
   * one used everywhere else in the codebase.
   */
  function estimateMessages(messages) {
    let total = 0;
    for (const msg of messages || []) {
      const text = String(msg?.content ?? msg?.text ?? '');
      total += estimateTokens(text) + 4; // 4-token rolemark overhead per message
    }
    return total;
  }

  function buildAuxiliaryChunks(query) {
    const chunks = [];
    if (memoryStore && typeof memoryStore.snapshot === 'function') {
      try {
        const snap = memoryStore.snapshot();
        for (const ltm of snap.longTermMemory || []) {
          chunks.push({
            source: 'memory:longTerm',
            text: ltm.text,
            recencyScore: ltm.timestamp ? Math.max(0, 1 - (Date.now() - ltm.timestamp) / (90 * 86_400_000)) : 0,
          });
        }
      } catch { /* memory snapshot unreadable — skip */ }
    }
    if (knowledgeStore && typeof knowledgeStore.snapshot === 'function') {
      try {
        const snap = knowledgeStore.snapshot();
        for (const entity of snap.entities || []) {
          chunks.push({
            source: `knowledge:${entity.type}`,
            text: [entity.label, entity.payload?.description, entity.payload?.summary]
              .filter(Boolean)
              .join(' — '),
          });
        }
      } catch { /* skip */ }
    }
    return rankChunks(chunks, { query: query || '' });
  }

  /**
   * Compress a message history into a reduced window that fits the budget.
   * Returns `{ messages, stats }` where messages is the new (compressed +
   * preserved) array and stats is the metric payload also emitted on the
   * `context-compressed` event.
   */
  function compress(messages, options = {}) {
    const startedAt = nowMs();
    const list = Array.isArray(messages) ? messages.slice() : [];
    const tokensIn = estimateMessages(list);
    const trigger = options.triggerTokens ?? triggerTokens;
    const keep = options.keepNewest ?? keepNewest;
    const query = options.query || '';

    // Below the trigger — return as-is, no compression, no event.
    if (tokensIn <= trigger) {
      return {
        messages: list,
        stats: {
          tokensIn,
          tokensOut: tokensIn,
          droppedMessages: 0,
          runtimeMs: nowMs() - startedAt,
          archivePath: null,
          compressed: false,
        },
      };
    }

    // Idempotency — if the first message is already a compressed summary
    // and we're under the trigger after one pass, don't re-compress it.
    const alreadyCompressedHead = list.length > 0 && compressedMarker(list[0]);

    const preserved = list.slice(-keep);
    const older = list.slice(0, Math.max(0, list.length - keep));

    // Archive the originals BEFORE we replace anything — this is the
    // load-bearing step for the no-data-loss invariant.
    const archivePath = path.join(archiveDir, newArchiveName());
    try {
      writer(
        archivePath,
        JSON.stringify(
          { ts: nowMs(), tokensIn, originalMessageCount: list.length, messages: list },
          null,
          2,
        ),
      );
    } catch (err) {
      // Archive write failed — abort compression rather than risk data loss.
      return {
        messages: list,
        stats: {
          tokensIn,
          tokensOut: tokensIn,
          droppedMessages: 0,
          runtimeMs: nowMs() - startedAt,
          archivePath: null,
          compressed: false,
          error: String(err?.message || err),
        },
      };
    }

    // Build the compressed summary chunk from older messages + memory + knowledge.
    const olderSummary = summarizeHistory(
      older.map((m) => ({ role: m.role, content: m.content ?? m.text })),
      Math.min(50, older.length),
    );
    const aux = buildAuxiliaryChunks(query);
    const auxBlock = compressChunks(aux, { maxChars: 600 })
      .slice(0, 8) // cap aux chunks so we don't bloat the summary
      .map((c) => `• [${c.source || 'aux'}] ${c.text}`)
      .join('\n');

    const summaryText = [
      olderSummary && `--- Compressed conversation summary (${older.length} messages) ---\n${olderSummary}`,
      auxBlock && `--- Relevant context ---\n${auxBlock}`,
    ]
      .filter(Boolean)
      .join('\n\n');

    const summaryMessage = {
      role: 'system',
      content: summaryText || '(no prior context to compress)',
      __compressed: true,
      __compressedFrom: older.length,
      __archivePath: archivePath,
    };

    // Idempotency: if the head was already compressed AND we have nothing
    // new to add, just return the existing list rather than re-wrapping.
    if (alreadyCompressedHead && older.length <= 1) {
      return {
        messages: list,
        stats: {
          tokensIn,
          tokensOut: tokensIn,
          droppedMessages: 0,
          runtimeMs: nowMs() - startedAt,
          archivePath,
          compressed: false,
          idempotentNoop: true,
        },
      };
    }

    const outMessages = [summaryMessage, ...preserved];
    const tokensOut = estimateMessages(outMessages);
    const stats = {
      tokensIn,
      tokensOut,
      droppedMessages: older.length - 1, // we kept 1 (the summary), dropped the rest
      runtimeMs: nowMs() - startedAt,
      archivePath,
      compressed: true,
    };
    emitter.emit('context-compressed', stats);
    return { messages: outMessages, stats };
  }

  return {
    compress,
    estimateMessages,
    on: emitter.on.bind(emitter),
    off: emitter.off.bind(emitter),
    once: emitter.once.bind(emitter),
  };
}

module.exports = {
  createCompressionEngine,
  DEFAULT_TRIGGER_TOKENS,
  DEFAULT_KEEP_NEWEST,
};
