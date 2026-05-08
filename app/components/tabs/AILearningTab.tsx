"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/client";
import { KnowledgeTab } from "./KnowledgeTab";
import { MemoryTab } from "./MemoryTab";
import { WebResearchTab } from "./WebResearchTab";

function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    async function checkAdmin() {
      // Use the server-side check endpoint which reads app_metadata.role,
      // which cannot be tampered with from the client.
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch("/api/admin/check", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = await res.json() as { isAdmin: boolean };
      setIsAdmin(json.isAdmin === true);
    }
    void checkAdmin();
  }, []);
  return isAdmin;
}

type AdminTool = "memory" | "knowledge" | "research";
const DEFAULT_TOOL: AdminTool = "knowledge";

export function AILearningTab({ dark }: { dark: boolean }) {
  const isAdmin = useIsAdmin();
  const [activeTool, setActiveTool] = useState<AdminTool>(DEFAULT_TOOL);
  const [visitedTools, setVisitedTools] = useState<AdminTool[]>([DEFAULT_TOOL]);

  const handleSelectTool = (tool: AdminTool) => {
    setActiveTool(tool);
    setVisitedTools((current) => (current.includes(tool) ? current : [...current, tool]));
  };

  if (!isAdmin) {
    return (
      <section className="flex h-full min-h-0 items-center justify-center overflow-auto bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
        <div className="w-full max-w-2xl rounded-3xl border border-rose-200/80 bg-white/90 p-8 text-center shadow-[0_24px_80px_-28px_rgba(190,24,93,0.24)] backdrop-blur">
          <div className="inline-flex items-center rounded-full border border-rose-300/70 bg-rose-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">
            Ograniczony dostęp
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-slate-900">Tylko dla administratora</h2>
          <p className="mt-2 text-sm leading-7 text-slate-600">
            Ten obszar zawiera narzędzia do kontroli pamięci, live RAG i tuningu AI.
          </p>
        </div>
      </section>
    );
  }

  const tools: { id: AdminTool; label: string; description: string }[] = [
    { id: "knowledge", label: "RAG knowledge", description: "Pliki, indeksowanie i stan retrieval" },
    { id: "research", label: "Live web RAG", description: "Zapytania Tavily, cache i źródła" },
    { id: "memory", label: "Memory", description: "Notatki, profile memory i podsumowania" },
  ];

  const headerCard = dark
    ? "border-slate-800 bg-slate-900 text-slate-100"
    : "border-sky-200/80 bg-white/90 text-slate-900";

  const muted = dark ? "text-slate-400" : "text-slate-600";
  const buttonBase = dark
    ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100";
  const buttonActive = "border-sky-500 bg-sky-600 text-white hover:bg-sky-600";

  return (
    <section className="flex h-full min-h-0 flex-col gap-4 overflow-hidden bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)] p-4 sm:p-6 lg:p-8">
      <div className={`rounded-3xl border p-5 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.24)] backdrop-blur ${headerCard}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">AI Learning controls</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight">Memory + RAG + tuning surface</h2>
        <p className={`mt-2 text-sm leading-7 ${muted}`}>
          Zastąpiono roadmapę. Tutaj są narzędzia do kontroli pamięci, wiedzy i live web RAG.
        </p>
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {tools.map((tool) => (
            <button
              key={tool.id}
              type="button"
              onClick={() => handleSelectTool(tool.id)}
              className={`rounded-2xl border px-3 py-3 text-left transition-colors ${activeTool === tool.id ? buttonActive : buttonBase}`}
            >
              <div className="text-sm font-semibold">{tool.label}</div>
              <div className="mt-1 text-xs opacity-90">{tool.description}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {visitedTools.includes("memory") ? (
          <div className={activeTool === "memory" ? "h-full" : "hidden"}>
            <MemoryTab dark={dark} />
          </div>
        ) : null}
        {visitedTools.includes("knowledge") ? (
          <div className={activeTool === "knowledge" ? "h-full" : "hidden"}>
            <KnowledgeTab dark={dark} />
          </div>
        ) : null}
        {visitedTools.includes("research") ? (
          <div className={activeTool === "research" ? "h-full" : "hidden"}>
            <WebResearchTab dark={dark} />
          </div>
        ) : null}
      </div>
    </section>
  );
}
