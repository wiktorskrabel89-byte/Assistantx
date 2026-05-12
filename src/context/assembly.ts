/**
 * Context Engineering — Assembly
 *
 * Budget-aware context assembly.  Combines the retrieval, ranking,
 * deduplication, compression, and budget-enforcement stages into one
 * orchestrated pipeline.
 *
 * The assembly pipeline:
 *   RETRIEVE → RANK + SCORE → DEDUPLICATE → FILTER BY MIN SCORE
 *   → COMPRESS LOW-PRIORITY → ENFORCE BUDGET → RETURN ASSEMBLED CONTEXT
 */

import type {
  AssembledContext,
  ContextAssemblyConfig,
  ContextEntry,
  ContextRetrievalQuery,
} from "@/src/context/types";
import { DEFAULT_ASSEMBLY_CONFIG } from "@/src/context/types";
import { retrieveContextEntries } from "@/src/context/retrieval";
import {
  deduplicateEntries,
  filterByMinScore,
  rankContextEntries,
} from "@/src/context/ranking";
import { compressToFit } from "@/src/context/compression";

// ─────────────────────────────────────────────────────────────────────────────
// Budget enforcement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Greedily select entries that fit within the token budget (highest priority first).
 * Returns the selected entries and the number of dropped entries.
 */
function enforceTokenBudget(
  entries: ContextEntry[],
  tokenBudget: number,
): { selected: ContextEntry[]; dropped: number } {
  const selected: ContextEntry[] = [];
  let usedTokens = 0;
  let dropped = 0;

  for (const entry of entries) {
    if (usedTokens + entry.estimatedTokens <= tokenBudget) {
      selected.push(entry);
      usedTokens += entry.estimatedTokens;
    } else {
      dropped++;
    }
  }

  return { selected, dropped };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main assembler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assemble ranked, compressed, and budget-enforced context for a query.
 *
 * @param query   - Retrieval + ranking query.
 * @param config  - Assembly configuration (defaults applied when omitted).
 * @param extra   - Additional pre-fetched entries (e.g. conversation history).
 */
export async function assembleContext(
  query: ContextRetrievalQuery,
  config: Partial<ContextAssemblyConfig> = {},
  extra: ContextEntry[] = [],
): Promise<AssembledContext> {
  const cfg: ContextAssemblyConfig = { ...DEFAULT_ASSEMBLY_CONFIG, ...config };

  // 1. Retrieve
  const rawEntries = [
    ...(await retrieveContextEntries(query)),
    ...extra,
  ];

  // 2. Rank + score
  const ranked = rankContextEntries(rawEntries, query.query, cfg);

  // 3. Deduplicate
  const deduped = deduplicateEntries(ranked);

  // 4. Filter by minimum priority score
  const filtered = filterByMinScore(deduped, cfg.minPriorityScore);

  // 5. Compress low-priority entries that are over budget
  let working = filtered;
  let compressedEntries = 0;

  if (cfg.compressLowPriority) {
    const { entries: compressed, compressedCount } = compressToFit(
      working,
      cfg.tokenBudget,
      query.query,
      cfg.compressionThreshold,
    );
    working = compressed;
    compressedEntries = compressedCount;
  }

  // 6. Enforce token budget (drop remaining over-budget entries)
  const { selected, dropped } = enforceTokenBudget(working, cfg.tokenBudget);

  const totalTokens = selected.reduce((sum, e) => sum + e.estimatedTokens, 0);

  return {
    entries: selected,
    totalTokens,
    tokenBudget: cfg.tokenBudget,
    droppedEntries: dropped,
    compressedEntries,
    assembledAt: new Date().toISOString(),
    query: query.query,
  };
}

/**
 * Convert an assembled context into a formatted string for injection into an
 * AI model system prompt or conversation message.
 */
export function formatAssembledContext(ctx: AssembledContext): string {
  if (ctx.entries.length === 0) return "";

  const sections = ctx.entries.map((entry) => {
    const header = `[${entry.source}]`;
    return `${header}\n${entry.content}`;
  });

  return sections.join("\n\n---\n\n");
}
