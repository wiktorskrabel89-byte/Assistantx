/**
 * Context Engineering — Retrieval
 *
 * Unified retrieval interface that collects raw context entries from all
 * sources (memory layers, knowledge chunks, workspace state, etc.) before
 * they are scored and assembled.
 */

import { randomUUID } from "node:crypto";
import type {
  ContextEntry,
  ContextRetrievalQuery,
  ContextSourceKind,
} from "@/src/context/types";

// ─────────────────────────────────────────────────────────────────────────────
// Token estimation (rough character-based heuristic; replace with tiktoken)
// ─────────────────────────────────────────────────────────────────────────────

export function estimateTokens(text: string): number {
  // GPT-family: ~4 characters per token on average.
  // TODO: Replace with tiktoken for exact token counts to improve budget accuracy.
  return Math.ceil(text.length / 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-source retrieval helpers
// ─────────────────────────────────────────────────────────────────────────────

async function retrieveMemoryLayer(
  query: ContextRetrievalQuery,
  layer: "short_term" | "episodic" | "semantic" | "procedural",
  kind: ContextSourceKind,
  limit: number,
): Promise<ContextEntry[]> {
  try {
    const { memoryService } = await import("@/src/memory/service/memory-service");
    const result = await memoryService.search({
      userId: query.userId,
      organizationId: query.organizationId,
      layer,
      query: query.query,
      limit,
    });

    return result.entries.map((entry) => ({
      id: randomUUID(),
      source: `memory.${layer}`,
      kind,
      content: entry.content,
      relevanceScore: entry.score,
      freshnessScore: computeFreshnessScore(entry.createdAt),
      priorityScore: 0, // computed by ranking stage
      estimatedTokens: estimateTokens(entry.content),
      trustLevel: "high" as const,
      createdAt: entry.createdAt,
      metadata: { memoryId: entry.id, layer },
    }));
  } catch {
    return [];
  }
}

function computeFreshnessScore(createdAt: string): number {
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  // Exponential decay: score = e^(-ageDays / 14).  Score ≈ 1 for today,
  // ≈ 0.5 for 9.7 days ago, ≈ 0.07 for 30 days ago.
  return Math.max(0, Math.min(1, Math.exp(-ageDays / 14)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Unified retrieval
// ─────────────────────────────────────────────────────────────────────────────

const KIND_TO_MEMORY_LAYER: Partial<
  Record<ContextSourceKind, "short_term" | "episodic" | "semantic" | "procedural">
> = {
  short_term_memory: "short_term",
  episodic_memory: "episodic",
  semantic_memory: "semantic",
  procedural_memory: "procedural",
};

const MEMORY_KINDS: ContextSourceKind[] = [
  "short_term_memory",
  "episodic_memory",
  "semantic_memory",
  "procedural_memory",
];

/**
 * Retrieve raw context entries from all enabled sources.
 *
 * Sources are queried in parallel.  Each source has an independent limit
 * so that no single source can crowd out others before ranking.
 */
export async function retrieveContextEntries(
  query: ContextRetrievalQuery,
): Promise<ContextEntry[]> {
  const maxPerSource = query.maxPerSource ?? 10;
  const includeKind = (kind: ContextSourceKind): boolean => {
    if (!query.sourceKinds || query.sourceKinds.length === 0) return true;
    return query.sourceKinds.includes(kind);
  };

  const tasks: Promise<ContextEntry[]>[] = [];

  // Memory layers
  for (const kind of MEMORY_KINDS) {
    if (!includeKind(kind)) continue;
    const layer = KIND_TO_MEMORY_LAYER[kind];
    if (!layer) continue;
    tasks.push(retrieveMemoryLayer(query, layer, kind, maxPerSource));
  }

  // All tasks run in parallel.
  const results = await Promise.allSettled(tasks);
  const entries: ContextEntry[] = [];
  for (const result of results) {
    if (result.status === "fulfilled") {
      entries.push(...result.value);
    }
  }

  return entries;
}
