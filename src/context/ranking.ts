/**
 * Context Engineering — Ranking
 *
 * Assigns a composite priority score to each context entry.  The score drives
 * which entries survive the token budget and in what order they appear.
 *
 * Priority formula:
 *   priority = relevance * relevanceWeight + freshness * freshnessWeight
 *
 * Keyword-overlap boosting is applied when the entry content contains words
 * from the query, improving recall for exact-match terms that vector search
 * may rank poorly.
 */

import type { ContextAssemblyConfig, ContextEntry } from "@/src/context/types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Content overlap fraction above which two entries are considered duplicates.
 * 80% keyword overlap reliably catches paraphrases and near-identical chunks
 * while allowing distinct entries that share domain vocabulary to coexist.
 */
const DEDUPLICATION_THRESHOLD = 0.8;

// ─────────────────────────────────────────────────────────────────────────────
// Keyword overlap scoring
// ─────────────────────────────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .split(/\W+/)
      .filter((t) => t.length > 2),
  );
}

/**
 * Returns a keyword overlap score in [0, 1].
 * Score = |query_terms ∩ content_terms| / |query_terms|
 */
function keywordOverlap(query: string, content: string): number {
  const queryTerms = tokenize(query);
  if (queryTerms.size === 0) return 0;
  const contentTerms = tokenize(content);
  let overlap = 0;
  for (const term of queryTerms) {
    if (contentTerms.has(term)) overlap++;
  }
  return overlap / queryTerms.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// Trust multiplier
// ─────────────────────────────────────────────────────────────────────────────

const TRUST_MULTIPLIER: Record<ContextEntry["trustLevel"], number> = {
  high: 1.0,
  medium: 0.9,
  low: 0.75,
};

// ─────────────────────────────────────────────────────────────────────────────
// Main ranking function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Score and sort context entries.
 *
 * Entries are mutated in-place (priorityScore updated) and then sorted
 * descending.  Returns a new sorted array; the input array is not reordered.
 */
export function rankContextEntries(
  entries: ContextEntry[],
  query: string,
  config: Pick<ContextAssemblyConfig, "relevanceWeight" | "freshnessWeight">,
): ContextEntry[] {
  const { relevanceWeight, freshnessWeight } = config;

  const scored = entries.map((entry) => {
    const keywordBoost = keywordOverlap(query, entry.content) * 0.2;
    const relevance = Math.min(1, entry.relevanceScore + keywordBoost);
    const freshness = entry.freshnessScore;
    const trust = TRUST_MULTIPLIER[entry.trustLevel];

    const priorityScore =
      (relevance * relevanceWeight + freshness * freshnessWeight) * trust;

    return { ...entry, priorityScore };
  });

  return scored.sort((a, b) => b.priorityScore - a.priorityScore);
}

/**
 * Filter entries that fall below the minimum priority threshold.
 */
export function filterByMinScore(
  entries: ContextEntry[],
  minPriorityScore: number,
): ContextEntry[] {
  return entries.filter((e) => e.priorityScore >= minPriorityScore);
}

/**
 * Deduplicate entries by content similarity.
 *
 * Simple approach: remove entries whose content shares > 80% keyword overlap
 * with a higher-ranked entry already in the result set.
 */
export function deduplicateEntries(entries: ContextEntry[]): ContextEntry[] {
  const seen: ContextEntry[] = [];
  for (const entry of entries) {
    const isDuplicate = seen.some((s) => {
      const overlap = keywordOverlap(s.content, entry.content);
      return overlap > DEDUPLICATION_THRESHOLD;
    });
    if (!isDuplicate) seen.push(entry);
  }
  return seen;
}
