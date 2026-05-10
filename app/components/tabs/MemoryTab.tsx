"use client";

import { BrainCircuit, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useWorkspace } from "@/app/providers/WorkspaceProvider";

type MemoryFact = {
  id: string;
  memory_key: string;
  memory_value: string;
  updated_at: string;
};

type MemorySummary = {
  id: string;
  summary: string;
  created_at: string;
};

export function MemoryTab({ dark }: { dark: boolean }) {
  const { activeWorkspace, setMemoryNotes } = useWorkspace();
  const [draftNotes, setDraftNotes] = useState(activeWorkspace.settings.memoryNotes);
  const [facts, setFacts] = useState<MemoryFact[]>([]);
  const [summaries, setSummaries] = useState<MemorySummary[]>([]);
  const [knowledgeStats, setKnowledgeStats] = useState<{ fileCount: number; readyFiles: number; totalChunks: number } | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDraftNotes(activeWorkspace.settings.memoryNotes);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [activeWorkspace.settings.memoryNotes]);

  const load = useCallback(async () => {
    const response = await fetch("/api/memory");
    if (!response.ok) return;
    const payload = await response.json() as {
      memories?: MemoryFact[];
      summaries?: MemorySummary[];
      knowledgeStats?: { fileCount: number; readyFiles: number; totalChunks: number } | null;
    };
    setFacts(Array.isArray(payload.memories) ? payload.memories : []);
    setSummaries(Array.isArray(payload.summaries) ? payload.summaries : []);
    setKnowledgeStats(payload.knowledgeStats ?? null);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [load]);

  const shell = dark ? "border-slate-800 bg-slate-900 text-slate-100" : "border-slate-200 bg-white text-slate-900";
  const card = dark ? "border-slate-800 bg-slate-950" : "border-slate-200 bg-slate-50";
  const muted = dark ? "text-slate-400" : "text-slate-600";

  return (
    <section className={`flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border ${shell}`}>
      <div className={`border-b px-5 py-4 ${dark ? "border-slate-800" : "border-slate-200"}`}>
        <div className="flex items-center gap-2">
          <BrainCircuit className="h-5 w-5 text-violet-500" />
          <h2 className="text-lg font-semibold">Memory</h2>
        </div>
        <p className={`mt-1 text-sm ${muted}`}>
          Combine short-term workspace notes with long-term vector memories and conversation summaries.
        </p>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_1fr]">
        <div className="min-h-0 space-y-4 overflow-y-auto">
          <div className={`rounded-2xl border p-4 ${card}`}>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold">Workspace memory notes</h3>
              <button
                type="button"
                onClick={() => setMemoryNotes(draftNotes)}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-3 py-2 text-sm font-medium text-white"
              >
                <Save className="h-4 w-4" />
                Save notes
              </button>
            </div>
            <textarea
              id="memory-workspace-notes"
              name="memoryWorkspaceNotes"
              aria-label="Workspace memory notes"
              value={draftNotes}
              onChange={(event) => setDraftNotes(event.target.value)}
              rows={8}
              className={`mt-3 w-full rounded-xl border px-3 py-2 text-sm outline-none ${dark ? "border-slate-700 bg-slate-900 text-slate-100" : "border-slate-300 bg-white text-slate-900"}`}
              placeholder="Store stable preferences, project context, and recurring instructions here."
            />
          </div>

          <div className={`rounded-2xl border p-4 ${card}`}>
            <h3 className="text-sm font-semibold">Long-term profile memory</h3>
            <div className="mt-3 space-y-3">
              {facts.length === 0 ? <p className={`text-sm ${muted}`}>No extracted profile memories yet.</p> : null}
              {facts.map((fact) => (
                <div key={fact.id} className={`rounded-xl border p-3 ${dark ? "border-slate-800" : "border-slate-200"}`}>
                  <div className="text-xs uppercase tracking-[0.12em] text-violet-500">{fact.memory_key}</div>
                  <div className="mt-1 text-sm">{fact.memory_value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <aside className="min-h-0 space-y-4 overflow-y-auto">
          <div className={`rounded-2xl border p-4 ${card}`}>
            <h3 className="text-sm font-semibold">Conversation summaries</h3>
            <div className="mt-3 space-y-3">
              {summaries.length === 0 ? <p className={`text-sm ${muted}`}>No summaries generated yet.</p> : null}
              {summaries.map((item) => (
                <div key={item.id} className={`rounded-xl border p-3 text-sm leading-6 ${dark ? "border-slate-800" : "border-slate-200"}`}>
                  {item.summary}
                </div>
              ))}
            </div>
          </div>

          <div className={`rounded-2xl border p-4 ${card}`}>
            <h3 className="text-sm font-semibold">Knowledge + retrieval health</h3>
            {knowledgeStats ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className={`rounded-xl border p-3 ${dark ? "border-slate-800" : "border-slate-200"}`}>
                  <div className={`text-xs ${muted}`}>Files</div>
                  <div className="mt-1 text-xl font-semibold">{knowledgeStats.fileCount}</div>
                </div>
                <div className={`rounded-xl border p-3 ${dark ? "border-slate-800" : "border-slate-200"}`}>
                  <div className={`text-xs ${muted}`}>Ready</div>
                  <div className="mt-1 text-xl font-semibold">{knowledgeStats.readyFiles}</div>
                </div>
                <div className={`rounded-xl border p-3 ${dark ? "border-slate-800" : "border-slate-200"}`}>
                  <div className={`text-xs ${muted}`}>Chunks</div>
                  <div className="mt-1 text-xl font-semibold">{knowledgeStats.totalChunks}</div>
                </div>
              </div>
            ) : (
              <p className={`mt-3 text-sm ${muted}`}>Knowledge metrics will appear after you sign in and upload files.</p>
            )}
          </div>
        </aside>
      </div>
    </section>
  );
}
