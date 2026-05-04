"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";

const COMPARE_MODELS = [
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (Free)" },
  { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (Free)" },
  { id: "openai/gpt-oss-120b:free", label: "GPT OSS 120B (Free)" },
  { id: "qwen/qwen3-235b-a22b:free", label: "Qwen 3 235B (Free)" },
  { id: "mistralai/mistral-small-3.1-24b-instruct:free", label: "Mistral Small 3.1 (Free)" },
  { id: "openai/gpt-5.1", label: "GPT-5.1" },
  { id: "anthropic/claude-sonnet-4.5", label: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-opus-4.6", label: "Claude Opus 4.6" },
  { id: "google/gemini-3-flash-preview", label: "Gemini 3 Flash" },
  { id: "deepseek/deepseek-v3.2", label: "DeepSeek V3.2" },
  { id: "x-ai/grok-3-mini", label: "Grok 3 Mini" },
];

export type ComparisonColumn = {
  model: string;
  response: string;
  loading: boolean;
};

export type ComparisonResults = {
  modelA: ComparisonColumn;
  modelB: ComparisonColumn;
} | null;

type ModelComparePanelProps = {
  open: boolean;
  dark: boolean;
  comparisonResults: ComparisonResults;
  onClose: () => void;
  onRunComparison: (modelA: string, modelB: string, prompt: string) => void;
};

export function ModelComparePanel({ open, dark, comparisonResults, onClose, onRunComparison }: ModelComparePanelProps) {
  const [modelA, setModelA] = useState(COMPARE_MODELS[0].id);
  const [modelB, setModelB] = useState(COMPARE_MODELS[2].id);
  const [prompt, setPrompt] = useState("");

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const handleRun = () => {
    if (!prompt.trim()) return;
    onRunComparison(modelA, modelB, prompt.trim());
  };

  const isRunning = comparisonResults?.modelA.loading || comparisonResults?.modelB.loading;
  const selectClass = `w-full rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400 ${dark ? "border-slate-700 bg-slate-800 text-slate-100" : "border-slate-200 bg-white text-slate-800"}`;
  const labelClass = `mb-1 text-[11px] font-medium ${dark ? "text-slate-400" : "text-slate-500"}`;

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close model comparison panel"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40"
        />
      ) : null}
      <div
        className={`fixed right-0 top-0 z-40 flex h-full w-[min(680px,calc(100vw-1rem))] flex-col shadow-2xl transition-transform duration-200 ${dark ? "bg-slate-900 border-l border-slate-800" : "bg-white border-l border-slate-200"} ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className={`flex items-center justify-between border-b px-4 py-3 ${dark ? "border-slate-800" : "border-slate-200"}`}>
          <h2 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>Model Comparison</h2>
          <button
            onClick={onClose}
            aria-label="Close model comparison panel"
            className={`rounded-lg p-1.5 transition-colors ${dark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className={`border-b px-4 py-3 space-y-3 ${dark ? "border-slate-800" : "border-slate-200"}`}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className={labelClass}>Model A</div>
              <select value={modelA} onChange={(e) => setModelA(e.target.value)} className={selectClass}>
                {COMPARE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
            <div>
              <div className={labelClass}>Model B</div>
              <select value={modelB} onChange={(e) => setModelB(e.target.value)} className={selectClass}>
                {COMPARE_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <div className={labelClass}>Prompt</div>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter a prompt to compare both models…"
              rows={3}
              className={`w-full resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400 ${dark ? "border-slate-700 bg-slate-800 text-slate-100 placeholder-slate-500" : "border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400"}`}
            />
          </div>
          <button
            type="button"
            onClick={handleRun}
            disabled={!prompt.trim() || Boolean(isRunning)}
            className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {isRunning ? "Running…" : "Run Comparison"}
          </button>
        </div>

        {comparisonResults ? (
          <div className="grid min-h-0 flex-1 grid-cols-2 overflow-hidden">
            {(["modelA", "modelB"] as const).map((key) => {
              const col = comparisonResults[key];
              const modelLabel = COMPARE_MODELS.find((m) => m.id === col.model)?.label ?? col.model;
              return (
                <div
                  key={key}
                  className={`flex min-h-0 flex-col ${key === "modelA" ? `border-r ${dark ? "border-slate-800" : "border-slate-200"}` : ""}`}
                >
                  <div className={`flex-shrink-0 border-b px-3 py-2 text-[11px] font-semibold truncate ${dark ? "border-slate-800 text-slate-300 bg-slate-800/50" : "border-slate-200 text-slate-600 bg-slate-50"}`}>
                    {modelLabel}
                  </div>
                  <div className="flex-1 overflow-y-auto px-3 py-3 text-sm">
                    {col.loading ? (
                      <div className="flex items-center gap-2 text-slate-400">
                        <span className="inline-block h-2 w-16 animate-pulse rounded-full bg-gradient-to-r from-cyan-400/40 via-blue-400/80 to-cyan-400/40" />
                        <span className="text-xs">Generating…</span>
                      </div>
                    ) : col.response ? (
                      <p className={`whitespace-pre-wrap leading-relaxed ${dark ? "text-slate-200" : "text-slate-800"}`}>{col.response}</p>
                    ) : (
                      <p className="text-xs text-slate-400">No response yet.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <p className={`text-sm ${dark ? "text-slate-500" : "text-slate-400"}`}>Run a comparison to see results here.</p>
          </div>
        )}
      </div>
    </>
  );
}
