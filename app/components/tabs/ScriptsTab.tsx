// Automation Scripts tab: manage saved scripts, run them via /api/jarvis.
"use client";

import { CodeXml, Loader2, Play, Plus, Trash2, X } from "lucide-react";
import { useState } from "react";
import { SandboxEditor } from "../SandboxEditor";

type Script = {
  id: string;
  name: string;
  language: string;
  body: string;
  createdAt: number;
};

type ScriptsTabProps = {
  dark: boolean;
};

const LANGUAGES = ["python", "javascript", "typescript", "bash", "sql"];

function createScript(): Script {
  return {
    id: `script-${Date.now()}`,
    name: "Untitled script",
    language: "python",
    body: "# Write your automation script here\n",
    createdAt: Date.now(),
  };
}

export function ScriptsTab({ dark }: ScriptsTabProps) {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [runResult, setRunResult] = useState<Record<string, string>>({});

  const selectedScript = scripts.find((s) => s.id === selectedId) ?? null;

  function addScript() {
    const s = createScript();
    setScripts((prev) => [...prev, s]);
    setSelectedId(s.id);
  }

  function deleteScript(id: string) {
    setScripts((prev) => {
      const updated = prev.filter((s) => s.id !== id);
      if (selectedId === id) setSelectedId(updated[0]?.id ?? null);
      return updated;
    });
  }

  function updateScript(id: string, patch: Partial<Script>) {
    setScripts((prev) => prev.map((s) => s.id === id ? { ...s, ...patch } : s));
  }

  async function runScript(script: Script) {
    setRunningId(script.id);
    setRunResult((prev) => ({ ...prev, [script.id]: "" }));
    try {
      const res = await fetch("/api/jarvis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: script.body, language: script.language }),
      });
      const data = await res.json().catch(() => ({})) as { output?: string; error?: string };
      setRunResult((prev) => ({
        ...prev,
        [script.id]: data.output ?? data.error ?? (res.ok ? "Done." : "Run failed."),
      }));
    } catch (e) {
      setRunResult((prev) => ({
        ...prev,
        [script.id]: e instanceof Error ? e.message : "Run failed.",
      }));
    } finally {
      setRunningId(null);
    }
  }

  const bg = dark
    ? "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.18),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(135deg,#020617,#0f172a_46%,#082f49)]"
    : "bg-[radial-gradient(circle_at_12%_14%,rgba(14,165,233,0.16),transparent_34%),radial-gradient(circle_at_88%_82%,rgba(251,146,60,0.14),transparent_36%),linear-gradient(140deg,#f8fafc,#e2e8f0_48%,#dbeafe)]";

  return (
    <section className={`flex h-full min-h-0 overflow-hidden animate-tab-enter ${bg}`}>
      {/* Sidebar: script list */}
      <div className={`flex w-56 flex-shrink-0 flex-col border-r ${dark ? "border-slate-800 bg-slate-950/60" : "border-slate-200 bg-white/70"}`}>
        <div className={`flex items-center justify-between border-b px-3 py-2.5 ${dark ? "border-slate-800" : "border-slate-200"}`}>
          <div className="flex items-center gap-2">
            <CodeXml className={`h-4 w-4 ${dark ? "text-sky-400" : "text-sky-600"}`} />
            <span className={`text-sm font-semibold ${dark ? "text-slate-100" : "text-slate-900"}`}>Scripts</span>
          </div>
          <button
            type="button"
            onClick={addScript}
            className={`rounded-lg p-1 transition-colors ${dark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
            title="New script"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {scripts.length === 0 ? (
            <div className={`px-3 py-6 text-center text-xs ${dark ? "text-slate-500" : "text-slate-400"}`}>
              No scripts yet.{" "}
              <button type="button" onClick={addScript} className="underline">Add one.</button>
            </div>
          ) : (
            scripts.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelectedId(s.id)}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                  s.id === selectedId
                    ? dark ? "bg-sky-900/50 text-sky-200" : "bg-sky-100 text-sky-800"
                    : dark ? "text-slate-300 hover:bg-slate-800" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="flex-1 truncate">{s.name}</span>
                <span className={`text-[9px] uppercase ${dark ? "text-slate-500" : "text-slate-400"}`}>{s.language}</span>
              </button>
            ))
          )}
        </div>
      </div>

      {/* Main editor area */}
      {selectedScript ? (
        <div className="flex flex-1 min-w-0 flex-col">
          {/* Toolbar */}
          <div className={`flex flex-shrink-0 items-center gap-2 border-b px-4 py-2 ${dark ? "border-slate-800 bg-slate-950/50" : "border-slate-200 bg-white/60"}`}>
            <input
              type="text"
              value={selectedScript.name}
              onChange={(e) => updateScript(selectedScript.id, { name: e.target.value })}
              className={`flex-1 rounded-lg border px-2 py-1 text-sm font-semibold outline-none ${dark ? "border-slate-700 bg-slate-800 text-slate-100" : "border-slate-200 bg-white text-slate-900"}`}
            />
            <select
              value={selectedScript.language}
              onChange={(e) => updateScript(selectedScript.id, { language: e.target.value })}
              className={`rounded-lg border px-2 py-1 text-xs outline-none ${dark ? "border-slate-700 bg-slate-800 text-slate-300" : "border-slate-200 bg-white text-slate-600"}`}
            >
              {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <button
              type="button"
              onClick={() => void runScript(selectedScript)}
              disabled={runningId === selectedScript.id}
              className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {runningId === selectedScript.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              Run
            </button>
            <button
              type="button"
              onClick={() => deleteScript(selectedScript.id)}
              className={`rounded-lg p-1.5 transition-colors ${dark ? "text-slate-400 hover:bg-slate-800 hover:text-red-400" : "text-slate-400 hover:bg-slate-100 hover:text-red-500"}`}
              title="Delete script"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Editor */}
          <div className="flex-1 min-h-0">
            <SandboxEditor
              language={selectedScript.language}
              value={selectedScript.body}
              onChange={(v) => updateScript(selectedScript.id, { body: v })}
              dark={dark}
              height="100%"
            />
          </div>

          {/* Run output */}
          {runResult[selectedScript.id] !== undefined && (
            <div className={`flex-shrink-0 border-t ${dark ? "border-slate-800 bg-slate-900" : "border-slate-200 bg-slate-50"}`}>
              <div className={`flex items-center justify-between px-4 py-1.5 text-xs font-semibold ${dark ? "text-slate-400" : "text-slate-500"}`}>
                <span>Output</span>
                <button type="button" onClick={() => setRunResult((prev) => { const n = { ...prev }; delete n[selectedScript.id]; return n; })}>
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <pre className={`max-h-40 overflow-auto px-4 pb-3 text-xs ${dark ? "text-slate-300" : "text-slate-700"}`}>
                {runResult[selectedScript.id] || "No output."}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <div className={`flex flex-1 flex-col items-center justify-center gap-3 text-center ${dark ? "text-slate-500" : "text-slate-400"}`}>
          <CodeXml className="h-10 w-10 opacity-30" />
          <p className="text-sm">Select a script or create a new one.</p>
          <button
            type="button"
            onClick={addScript}
            className="mt-1 inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
          >
            <Plus className="h-3.5 w-3.5" />
            New script
          </button>
        </div>
      )}
    </section>
  );
}
