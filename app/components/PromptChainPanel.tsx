"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useState } from "react";

const MAX_STEPS = 6;

type PromptChainPanelProps = {
  open: boolean;
  dark: boolean;
  onClose: () => void;
  onRunChain: (steps: string[]) => void;
};

export function PromptChainPanel({ open, dark, onClose, onRunChain }: PromptChainPanelProps) {
  const [steps, setSteps] = useState<string[]>(["", ""]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const updateStep = (index: number, value: string) => {
    setSteps((prev) => prev.map((s, i) => (i === index ? value : s)));
  };

  const addStep = () => {
    if (steps.length >= MAX_STEPS) return;
    setSteps((prev) => [...prev, ""]);
  };

  const removeStep = (index: number) => {
    if (steps.length <= 1) return;
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleRun = () => {
    const nonEmpty = steps.filter((s) => s.trim());
    if (nonEmpty.length === 0) return;
    onRunChain(nonEmpty);
    onClose();
  };

  return (
    <>
      {open ? (
        <button
          type="button"
          aria-label="Close prompt chain panel"
          onClick={onClose}
          className="fixed inset-0 z-30 bg-black/40"
        />
      ) : null}
      <div
        className={`fixed right-0 top-0 z-40 h-full w-96 max-w-full shadow-2xl transition-transform duration-200 ${dark ? "bg-slate-900 border-l border-slate-800" : "bg-white border-l border-slate-200"} ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <div className="flex h-full flex-col">
          <div className={`flex items-center justify-between border-b px-4 py-3 ${dark ? "border-slate-800" : "border-slate-200"}`}>
            <h2 className={`text-sm font-semibold ${dark ? "text-white" : "text-slate-900"}`}>Prompt Chain</h2>
            <button
              onClick={onClose}
              aria-label="Close prompt chain panel"
              className={`rounded-lg p-1.5 transition-colors ${dark ? "hover:bg-slate-800 text-slate-400" : "hover:bg-slate-100 text-slate-500"}`}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            <p className={`text-xs leading-relaxed ${dark ? "text-slate-400" : "text-slate-500"}`}>
              Chain multiple prompts sequentially. Use{" "}
              <code className={`rounded px-1 text-[11px] ${dark ? "bg-slate-800" : "bg-slate-200"}`}>{"{{output}}"}</code>{" "}
              to reference the previous step&apos;s reply, or{" "}
              <code className={`rounded px-1 text-[11px] ${dark ? "bg-slate-800" : "bg-slate-200"}`}>{"{{input}}"}</code>{" "}
              for the original first prompt. Steps are processed one at a time so the AI&apos;s prior reply is available in context.
            </p>
            {steps.map((step, index) => (
              <div key={index} className="flex gap-2">
                <div className="flex-1 space-y-1">
                  <div className={`text-[11px] font-medium ${dark ? "text-slate-400" : "text-slate-500"}`}>
                    Step {index + 1}
                  </div>
                  <textarea
                    value={step}
                    onChange={(e) => updateStep(index, e.target.value)}
                    placeholder={index === 0 ? "Enter the first prompt…" : `Use {{output}} from step ${index}…`}
                    rows={3}
                    className={`w-full resize-none rounded-xl border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400 ${dark ? "border-slate-700 bg-slate-800 text-slate-100 placeholder-slate-500" : "border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400"}`}
                  />
                </div>
                {steps.length > 1 ? (
                  <button
                    type="button"
                    aria-label={`Remove step ${index + 1}`}
                    onClick={() => removeStep(index)}
                    className={`mt-6 flex-shrink-0 rounded-lg p-1.5 transition-colors ${dark ? "hover:bg-slate-800 text-slate-500 hover:text-red-400" : "hover:bg-slate-100 text-slate-400 hover:text-red-500"}`}
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}

            {steps.length < MAX_STEPS ? (
              <button
                type="button"
                onClick={addStep}
                className={`flex w-full items-center justify-center gap-2 rounded-xl border border-dashed py-2.5 text-sm transition-colors ${dark ? "border-slate-700 text-slate-400 hover:border-slate-500 hover:text-slate-200" : "border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600"}`}
              >
                <Plus className="h-4 w-4" />
                Add step
              </button>
            ) : null}
          </div>

          <div className={`border-t px-4 py-3 ${dark ? "border-slate-800" : "border-slate-200"}`}>
            <button
              type="button"
              onClick={handleRun}
              disabled={steps.every((s) => !s.trim())}
              className="w-full rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 py-2.5 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              Run chain
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
