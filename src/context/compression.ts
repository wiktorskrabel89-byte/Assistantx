/**
 * Context Engineering — Compression
 *
 * Token-aware compression of context entries that are over-budget.
 *
 * Compression strategies (in order of preference):
 * 1. Sentence truncation — keep the first N sentences.
 * 2. Key-sentence extraction — keep sentences that contain query keywords.
 * 3. Hard truncation — cut to a fixed character limit as a last resort.
 *
 * Compression is applied to low-priority entries first (those closest to the
 * compressionThreshold) before dropping them outright.
 */

import { estimateTokens } from "@/src/context/retrieval";
import type { ContextEntry } from "@/src/context/types";

// ─────────────────────────────────────────────────────────────────────────────
// Sentence splitting
// ─────────────────────────────────────────────────────────────────────────────

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Key sentence extraction
// ─────────────────────────────────────────────────────────────────────────────

function extractKeySentences(text: string, query: string, maxSentences: number): string {
  const queryTerms = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2),
  );

  const sentences = splitSentences(text);
  const scored = sentences.map((sentence) => {
    const lc = sentence.toLowerCase();
    let hits = 0;
    for (const term of queryTerms) {
      if (lc.includes(term)) hits++;
    }
    return { sentence, hits };
  });

  // Keep the top-scoring sentences, but preserve original order.
  const threshold = Math.max(1, Math.floor(maxSentences * 0.6));
  const topHits = [...scored].sort((a, b) => b.hits - a.hits).slice(0, threshold);
  const topSet = new Set(topHits.map((s) => s.sentence));

  const kept = sentences.filter((s) => topSet.has(s)).slice(0, maxSentences);
  return kept.join(" ") + (kept.length < sentences.length ? " [...]" : "");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main compression function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compress a single context entry to fit within a target token budget.
 *
 * Returns a new ContextEntry with compressed content and updated token count.
 * If the content already fits, the original entry is returned unchanged.
 */
export function compressEntry(
  entry: ContextEntry,
  targetTokens: number,
  query: string,
): ContextEntry {
  if (entry.estimatedTokens <= targetTokens) return entry;

  // Approximate target character count from token target.
  const targetChars = targetTokens * 4;

  // Strategy 1: key-sentence extraction
  const maxSentences = Math.max(2, Math.floor(targetChars / 150));
  const compressed = extractKeySentences(entry.content, query, maxSentences);

  if (estimateTokens(compressed) <= targetTokens) {
    return {
      ...entry,
      content: compressed,
      estimatedTokens: estimateTokens(compressed),
      metadata: { ...entry.metadata, compressed: true, strategy: "key_sentences" },
    };
  }

  // Strategy 2: hard truncation
  const hardTruncated = entry.content.slice(0, targetChars - 10) + " [...]";
  return {
    ...entry,
    content: hardTruncated,
    estimatedTokens: estimateTokens(hardTruncated),
    metadata: { ...entry.metadata, compressed: true, strategy: "hard_truncation" },
  };
}

/**
 * Compress a list of entries to collectively fit a total token budget.
 *
 * Strategy: compress low-priority entries first.  Returns the compressed list
 * plus the count of entries that were compressed.
 */
export function compressToFit(
  entries: ContextEntry[],
  tokenBudget: number,
  query: string,
  compressionThreshold: number,
): { entries: ContextEntry[]; compressedCount: number } {
  let usedTokens = entries.reduce((sum, e) => sum + e.estimatedTokens, 0);
  if (usedTokens <= tokenBudget) {
    return { entries, compressedCount: 0 };
  }

  // Sort: compress lowest-priority entries first.
  const withIndex = entries.map((e, i) => ({ entry: e, originalIndex: i }));
  withIndex.sort((a, b) => a.entry.priorityScore - b.entry.priorityScore);

  const result = [...entries];
  let compressedCount = 0;

  for (const { entry, originalIndex } of withIndex) {
    if (usedTokens <= tokenBudget) break;

    // Only compress entries below the compression threshold.
    if (entry.priorityScore > compressionThreshold) continue;

    const excessTokens = usedTokens - tokenBudget;
    const targetTokens = Math.max(
      50,
      entry.estimatedTokens - excessTokens - 10,
    );

    const compressed = compressEntry(entry, targetTokens, query);
    if (compressed !== entry) {
      usedTokens -= entry.estimatedTokens - compressed.estimatedTokens;
      result[originalIndex] = compressed;
      compressedCount++;
    }
  }

  return { entries: result, compressedCount };
}
