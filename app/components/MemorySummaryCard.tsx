"use client";

import { BrainCircuit } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

type MemoryFact = {
  id: string;
  memory_key: string;
  memory_value: string;
  updated_at: string;
};

type MemorySummaryResponse = {
  memories?: MemoryFact[];
};

function groupMemoriesByScope(memories: MemoryFact[]) {
  const grouped = new Map<string, MemoryFact[]>();
  for (const fact of memories) {
    const key = fact.memory_key;
    const modelScopedMatch = key.match(/^([a-z0-9-]+\/[a-z0-9:._+-]+)(::|:)/i);
    const scope = modelScopedMatch?.[1] ?? "General";
    const bucket = grouped.get(scope) ?? [];
    bucket.push(fact);
    grouped.set(scope, bucket);
  }
  return grouped;
}

export function MemorySummaryCard({ dark }: { dark: boolean }) {
  const [facts, setFacts] = useState<MemoryFact[]>([]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void fetch("/api/memory")
        .then((response) => (response.ok ? response.json() : null))
        .then((payload: MemorySummaryResponse | null) => {
          setFacts(Array.isArray(payload?.memories) ? payload!.memories : []);
        })
        .catch(() => {
          setFacts([]);
        });
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const groupedMemories = useMemo(() => groupMemoriesByScope(facts), [facts]);
  const hasModelScopedGroups = Array.from(groupedMemories.keys()).some((scope) => scope !== "General");
  const mutedClass = dark ? "text-slate-300" : "text-slate-600";
  const softSurfaceClass = dark ? "border-slate-800 bg-slate-900/60" : "border-slate-200 bg-slate-50/80";
  const chipClass = dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700";

  return (
    <div className={`mt-4 rounded-2xl border p-4 ${softSurfaceClass}`}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-semibold">
            <BrainCircuit className="h-4 w-4 text-violet-500" />
            What AssistantX remembers about you
          </div>
          <p className={`mt-1 text-xs ${mutedClass}`}>Long-term profile memory across your model usage.</p>
        </div>
        <button
          type="button"
          className="text-xs font-medium text-sky-600 hover:underline dark:text-sky-300"
          onClick={() => {
            window.dispatchEvent(new CustomEvent("assistantx:navigate-tab", { detail: { tab: "ai-learning" } }));
            window.dispatchEvent(new CustomEvent("assistantx:ai-learning-tool", { detail: { tool: "memory" } }));
          }}
        >
          View all memories →
        </button>
      </div>

      {facts.length === 0 ? (
        <p className={`mt-3 text-sm ${mutedClass}`}>No memories yet.</p>
      ) : hasModelScopedGroups ? (
        <div className="mt-3 space-y-2">
          {Array.from(groupedMemories.entries()).map(([scope, scopedFacts]) => (
            <details key={scope} className={`rounded-xl border px-3 py-2 ${chipClass}`} open={scope === "General"}>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-violet-500">
                {scope}
              </summary>
              <div className="mt-2 space-y-2">
                {scopedFacts.map((fact) => (
                  <div key={fact.id} className={`rounded-lg border px-2 py-1.5 text-xs ${chipClass}`}>
                    <span className="font-semibold">{fact.memory_key}:</span> {fact.memory_value}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-2">
          {facts.map((fact) => (
            <div key={fact.id} className={`rounded-full border px-2.5 py-1 text-xs ${chipClass}`}>
              <span className="font-semibold">{fact.memory_key}:</span> {fact.memory_value}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
