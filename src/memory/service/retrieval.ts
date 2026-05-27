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

  const terms = String(query.query ?? "")
    .toLowerCase()
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean);

  const semanticScored = candidates.map((entry) => {
    if (terms.length === 0) return entry;
    const haystack = `${entry.content} ${entry.tags.join(" ")}`.toLowerCase();
    const lexicalHits = terms.reduce((sum, term) => (haystack.includes(term) ? sum + 1 : sum), 0);
    const lexicalScore = lexicalHits / terms.length;
    const recencyDays = Math.max(
      0,
      (Date.now() - new Date(entry.createdAt).getTime()) / (1000 * 60 * 60 * 24),
    );
    const recencyBoost = Math.max(0, 1 - Math.min(30, recencyDays) / 30) * 0.15;
    return {
      ...entry,
      score: Number((entry.score * 0.6 + lexicalScore * 0.4 + recencyBoost).toFixed(4)),
    };
  });

  const minScore = query.minScore ?? 0;
  const limit = query.limit ?? 20;
  const ranked = rankResults(applyMinScore(semanticScored, minScore)).slice(0, limit);

  return {
    entries: ranked,
    totalFound: ranked.length,
  };
}
