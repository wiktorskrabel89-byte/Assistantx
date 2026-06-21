"use client";

/**
 * Workspace → Szukaj. Real full-text search across the user-facing stores
 * we already have on-disk: Memory V1 (long-term + conversation + project
 * notes) and Skill Confidence (skill ids).
 *
 * Scoring is a simple keyword-overlap rank — same intuition as the
 * jarvis/desktop hybrid-search heuristic. Phase 9's Context Compression
 * Engine will replace this with a proper retriever + reranker.
 */

import { Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { SectionCard } from "../SectionCard";
import { readMemory } from "../../../lib/memory-v1";
import { rankSkills } from "../../../lib/skill-confidence";

type Hit = {
  source: "ltm" | "conversation" | "project" | "skill" | "instruction";
  id: string;
  text: string;
  score: number;
};

function tokenize(input: string): string[] {
  return input
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^\p{L}\p{N}_]/gu, ""))
    .filter((t) => t.length >= 2);
}

function scoreText(query: string[], haystack: string): number {
  if (haystack.length === 0) return 0;
  const lower = haystack.toLowerCase();
  let score = 0;
  for (const term of query) {
    if (!term) continue;
    if (lower.includes(term)) score += 1;
    // Boost short queries that match more than once.
    const occurrences = lower.split(term).length - 1;
    if (occurrences > 1) score += Math.min(2, occurrences - 1) * 0.3;
  }
  return score;
}

export function SearchSection() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);

  // Recompute on a small debounce so typing isn't expensive even with 1000s
  // of entries in Memory V1. The empty-query path is handled at render time
  // (hits === null) — keeping it OUT of the effect avoids React 19's
  // set-state-in-effect warning.
  const trimmedQuery = query.trim();
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!trimmedQuery) return;
    const timer = window.setTimeout(() => {
      const tokens = tokenize(trimmedQuery);
      const mem = readMemory();
      const out: Hit[] = [];

      for (const entry of mem.longTermMemory) {
        const score = scoreText(tokens, entry.text);
        if (score > 0) out.push({ source: "ltm", id: entry.id, text: entry.text, score });
      }
      for (const entry of mem.conversationMemory) {
        const score = scoreText(tokens, entry.text);
        if (score > 0) out.push({ source: "conversation", id: entry.id, text: entry.text, score });
      }
      for (const [projectId, project] of Object.entries(mem.projectKnowledge)) {
        for (const note of project.notes) {
          const score = scoreText(tokens, note);
          if (score > 0) out.push({ source: "project", id: `${projectId}/${note.slice(0, 40)}`, text: note, score });
        }
      }
      if (mem.customInstructions.systemPrompt) {
        const score = scoreText(tokens, mem.customInstructions.systemPrompt);
        if (score > 0) {
          out.push({ source: "instruction", id: "system-prompt", text: mem.customInstructions.systemPrompt, score });
        }
      }
      for (const { id } of rankSkills()) {
        const score = scoreText(tokens, id);
        if (score > 0) out.push({ source: "skill", id, text: id, score });
      }

      out.sort((a, b) => b.score - a.score);
      setHits(out.slice(0, 30));
    }, 120);
    return () => window.clearTimeout(timer);
  }, [trimmedQuery]);

  // Reset displayed hits when query is cleared. Derived render-time value —
  // not state — so this is purely a presentation concern, not an effect.
  const displayedHits = trimmedQuery ? hits : null;

  const summary = useMemo(() => {
    if (!trimmedQuery) return "Wpisz zapytanie powyżej, aby przeszukać Memory V1 + Skill Confidence.";
    if (displayedHits === null) return "Szukam…";
    if (displayedHits.length === 0) return `Nic nie pasuje do „${trimmedQuery}”.`;
    return `${displayedHits.length} dopasowań · Memory V1 + Skill Confidence`;
  }, [displayedHits, trimmedQuery]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionCard Icon={Search} title="Wyszukiwanie globalne" description="Indeks: Long-Term Memory, Conversation Memory, Project Knowledge, Custom Instructions, Skills.">
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="np. „landing page”, „react hooks”, „spotkanie”"
            style={{
              flex: 1,
              padding: "10px 12px",
              background: "var(--ox-bg3)",
              border: "1px solid var(--ox-border)",
              borderRadius: 6,
              color: "var(--ox-text-hi)",
              fontFamily: "var(--ox-font-sans)",
              fontSize: 13,
              outline: "none",
            }}
          />
        </div>

        <div
          style={{
            marginTop: 12,
            color: "var(--ox-text-dim)",
            fontFamily: "var(--ox-font-mono)",
            fontSize: 10,
            letterSpacing: "0.06em",
          }}
        >
          {summary}
        </div>

        {displayedHits && displayedHits.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: "10px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
            {displayedHits.map((hit) => (
              <li
                key={`${hit.source}:${hit.id}`}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 10,
                  padding: "8px 12px",
                  borderRadius: 6,
                  border: "1px solid var(--ox-border)",
                  background: "var(--ox-bg2)",
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    color: SOURCE_COLOR[hit.source],
                    fontFamily: "var(--ox-font-mono)",
                    fontSize: 9.5,
                    letterSpacing: "0.10em",
                    textTransform: "uppercase",
                    minWidth: 84,
                  }}
                >
                  {SOURCE_LABEL[hit.source]}
                </span>
                <span style={{ color: "var(--ox-text-hi)", fontSize: 12.5, lineHeight: 1.45 }}>{hit.text}</span>
                <span
                  style={{
                    color: "var(--ox-text-dim)",
                    fontFamily: "var(--ox-font-mono)",
                    fontSize: 10,
                  }}
                  title="score"
                >
                  {hit.score.toFixed(1)}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </SectionCard>
    </div>
  );
}

const SOURCE_LABEL: Record<Hit["source"], string> = {
  ltm: "long-term",
  conversation: "conversation",
  project: "project",
  skill: "skill",
  instruction: "instruction",
};

const SOURCE_COLOR: Record<Hit["source"], string> = {
  ltm: "var(--ox-cyan)",
  conversation: "var(--ox-purple)",
  project: "var(--ox-amber)",
  skill: "var(--ox-green)",
  instruction: "var(--ox-text-mid)",
};
