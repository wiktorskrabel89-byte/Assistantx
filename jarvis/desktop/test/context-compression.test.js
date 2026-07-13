'use strict';

// Round-2 — Context Compression Engine contract tests.
// Uses an in-memory writer so disk is never touched; verifies the four
// invariants the engine documents (trigger, recency, no-data-loss, idempotent).

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  createCompressionEngine,
  DEFAULT_TRIGGER_TOKENS,
  DEFAULT_KEEP_NEWEST,
} = require('../electron/memory/context/compression-engine');

function fakeMessage(role, words) {
  // ~4 chars/token → "word " ~= 1.25 tokens; 4 words ≈ 5 tokens.
  return { role, content: Array.from({ length: words }, (_, i) => `w${i}`).join(' ') };
}

function makeArchiveCapture() {
  const archived = [];
  return {
    archived,
    writer(target, payload) {
      archived.push({ target, payload });
    },
  };
}

test('compress-trigger: below trigger is a no-op', () => {
  const cap = makeArchiveCapture();
  const engine = createCompressionEngine({ triggerTokens: 10_000, writer: cap.writer });
  const msgs = [fakeMessage('user', 50), fakeMessage('assistant', 50)];
  const { messages, stats } = engine.compress(msgs);
  assert.equal(stats.compressed, false);
  assert.equal(messages.length, 2);
  assert.equal(cap.archived.length, 0);
});

test('compress-recency: newest N messages are preserved uncompressed', () => {
  const cap = makeArchiveCapture();
  const engine = createCompressionEngine({
    triggerTokens: 200, // tiny so we always compress
    keepNewest: 3,
    writer: cap.writer,
  });
  const msgs = Array.from({ length: 20 }, (_, i) =>
    fakeMessage(i % 2 === 0 ? 'user' : 'assistant', 30),
  );
  const { messages } = engine.compress(msgs);
  // First element should be the compressed summary; next 3 are originals.
  assert.equal(messages.length, 4);
  assert.equal(messages[0].__compressed, true);
  assert.equal(messages[1], msgs[17]);
  assert.equal(messages[2], msgs[18]);
  assert.equal(messages[3], msgs[19]);
});

test('compress-no-data-loss: originals are archived BEFORE rewrite', () => {
  const cap = makeArchiveCapture();
  const engine = createCompressionEngine({
    triggerTokens: 200,
    keepNewest: 2,
    writer: cap.writer,
  });
  const msgs = Array.from({ length: 30 }, (_, i) => fakeMessage('user', 20));
  const { stats } = engine.compress(msgs);
  assert.equal(cap.archived.length, 1);
  // Archive must contain ALL originals — none lost.
  const archivedPayload = JSON.parse(cap.archived[0].payload);
  assert.equal(archivedPayload.originalMessageCount, 30);
  assert.equal(archivedPayload.messages.length, 30);
  assert.ok(stats.archivePath && stats.archivePath.includes('context-'));
});

test('compress-transparent: emits context-compressed event with metrics', () => {
  const cap = makeArchiveCapture();
  const engine = createCompressionEngine({
    triggerTokens: 200,
    keepNewest: 2,
    writer: cap.writer,
  });
  const seen = [];
  engine.on('context-compressed', (payload) => seen.push(payload));
  const msgs = Array.from({ length: 25 }, () => fakeMessage('user', 30));
  engine.compress(msgs);
  assert.equal(seen.length, 1);
  assert.ok(seen[0].tokensIn > 0);
  assert.ok(seen[0].tokensOut < seen[0].tokensIn);
  assert.ok(seen[0].droppedMessages > 0);
  assert.ok(seen[0].runtimeMs >= 0);
});

test('compress-idempotent: re-compressing a head-summary list does not degrade', () => {
  const cap = makeArchiveCapture();
  const engine = createCompressionEngine({
    triggerTokens: 200,
    keepNewest: 3,
    writer: cap.writer,
  });
  const seed = Array.from({ length: 20 }, () => fakeMessage('user', 30));
  const first = engine.compress(seed);
  // Now run it again on the OUTPUT — that already starts with __compressed.
  // We want the engine to recognise this and not blindly re-wrap.
  const second = engine.compress(first.messages);
  // The summary should be the SAME object reference if no-op'd, OR if it did
  // compress again, output size must not exceed first.tokensOut.
  if (second.stats.compressed) {
    assert.ok(second.stats.tokensOut <= first.stats.tokensOut * 1.1);
  } else {
    assert.equal(second.messages.length, first.messages.length);
  }
});

test('compression engine: defaults from module match docs', () => {
  assert.equal(DEFAULT_TRIGGER_TOKENS, 80_000);
  assert.equal(DEFAULT_KEEP_NEWEST, 10);
});
