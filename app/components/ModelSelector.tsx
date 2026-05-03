"use client";

import { Bot, Code2, Crown, Lock, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchAllModels } from "../api/openrouter/fetchAllModels";
import { PRO_PLUS_ONLY_MODELS } from "@/lib/ai-config";

type OpenRouterModel = {
  id: string;
  description?: string;
};

type ModelSelectorProps = {
  dark: boolean;
  preferredModelId: string | null;
  isPremium: boolean;
  onSelectModel: (modelId: string | null) => void;
  isProPlus?: boolean;
};


export function ModelSelector({ dark, preferredModelId, isPremium, onSelectModel, isProPlus = false }: ModelSelectorProps) {
  const [open, setOpen] = useState(false);
  const [allModels, setAllModels] = useState<OpenRouterModel[]>([]);
  const isAuto = preferredModelId === null;

  useEffect(() => {
    fetchAllModels().then((models) => {
      setAllModels(models);
      if (!models || models.length === 0) {
        console.warn('ModelSelector: No models loaded', models);
      }
    });
  }, []);

  const pillBase = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none";
  const pillActive = dark
    ? "border-blue-700 bg-blue-950/40 text-blue-200"
    : "border-blue-300 bg-blue-50 text-blue-700";
  const pillInactive = dark
    ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100";
  const pillLocked = dark
    ? "border-slate-700 bg-slate-900/50 text-slate-500 cursor-not-allowed opacity-60"
    : "border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed opacity-60";

  const sectionLabel = `text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-slate-500" : "text-slate-400"}`;

  return (
    <div className="w-full">
      <button
        className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold mb-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="model-selector-list"
      >
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {open ? "Ukryj wybór modelu" : "Pokaż wybór modelu"}
      </button>
      {open && (
        <div
          id="model-selector-list"
          className="flex flex-wrap items-center gap-2 overflow-x-auto max-w-full scrollbar-thin scrollbar-thumb-slate-400 scrollbar-track-slate-100"
        >
          <button
            onClick={() => onSelectModel(null)}
            className={`${pillBase} ${isAuto ? pillActive : pillInactive}`}
            title="Automatically pick the best model for your request"
          >
            <Zap className="h-3 w-3" />
            Auto
          </button>

          {isPremium && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500">
              <Crown className="h-3 w-3" />
              {isProPlus ? "Pro+" : "Pro"}
            </span>
          )}

          <span className={sectionLabel}>
            <Code2 className="mr-0.5 inline h-3 w-3" />
            All Models
          </span>
          {allModels.map((model) => {
            // Claude Opus 4.7 requires Pro+
            const requiresProPlus = PRO_PLUS_ONLY_MODELS.includes(model.id);
            const locked = requiresProPlus
              ? !isProPlus
              : Boolean(!isPremium && (model.id.includes("opus") || model.description?.toLowerCase().includes("premium")));
            const lockReason = requiresProPlus
              ? `Pro+ plan required for ${model.id}`
              : `Premium plan required for ${model.id}`;
            return (
              <button
                key={model.id}
                onClick={() => !locked && onSelectModel(model.id)}
                className={`${pillBase} ${locked ? pillLocked : preferredModelId === model.id ? pillActive : pillInactive}`}
                title={locked ? lockReason : `Use ${model.id}`}
                disabled={locked}
              >
                {locked ? <Lock className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                {model.id}
                {requiresProPlus && <Crown className="h-3 w-3 text-purple-400" aria-label="Pro+ exclusive" />}
                {model.description ? <span className="ml-1 text-xs text-slate-400">{model.description}</span> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
