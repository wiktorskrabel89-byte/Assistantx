import type { MemoryEntry, MemoryQuery, MemorySearchResult } from "@/src/memory/service/types";

export function rankResults(entries: MemoryEntry[]): MemoryEntry[] {
  return [...entries].sort((a, b) => b.score - a.score);
}

export function applyMinScore(entries: MemoryEntry[], minScore: number): MemoryEntry[] {
  return entries.filter((e) => e.score >= minScore);
}

export async function retrieveMemory(
  query: MemoryQuery,
  allEntries: MemoryEntry[],
): Promise<MemorySearchResult> {
  let candidates = allEntries.filter((e) => e.userId === query.userId);

  if (query.organizationId) {
    candidates = candidates.filter(
      (e) => e.organizationId === query.organizationId || e.organizationId === null,
    );
  }
  if (query.layer) {
    candidates = candidates.filter((e) => e.layer === query.layer);
  }

  const minScore = query.minScore ?? 0;
  const limit = query.limit ?? 20;
  const ranked = rankResults(applyMinScore(candidates, minScore)).slice(0, limit);

  return {
    entries: ranked,
    totalFound: ranked.length,
  };
}
