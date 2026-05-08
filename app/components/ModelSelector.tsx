"use client";

import { Bot, Code2, Crown, Lock, Zap, ChevronDown, ChevronUp, Brain } from "lucide-react";
import { useId, useState } from "react";
import { ALL_MODELS, CHAT_MODELS, CODE_MODELS, isModelPremiumOnly, isModelProPlusOnly, REASONING_MODEL_IDS } from "@/lib/ai-config";
import type { AppMode } from "../lib/chat-types";

const THINKING_EFFORTS = ["Low", "Medium", "High", "Xhigh"] as const;
export type ThinkingEffort = (typeof THINKING_EFFORTS)[number];

type ModelSelectorProps = {
  dark: boolean;
  preferredModelId: string | null;
  isPremium: boolean;
  onSelectModel: (modelId: string | null) => void;
  isProPlus?: boolean;
  thinkingEffort?: ThinkingEffort;
  onThinkingEffortChange?: (effort: ThinkingEffort) => void;
  appMode?: AppMode;
};


export function ModelSelector({ dark, preferredModelId, isPremium, onSelectModel, isProPlus = false, thinkingEffort = "Medium", onThinkingEffortChange, appMode }: ModelSelectorProps) {
  const modelListId = useId();
  const lockedDescId = useId();
  const moreModelsId = useId();
  const [open, setOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const isAuto = preferredModelId === null;

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

  // Filter the visible model list based on the current app mode
  const visibleModels: { id: string; label: string; description: string }[] =
    appMode === "ai-chat"
      ? CHAT_MODELS.map((m) => ({ id: m.id, label: m.label, description: m.description }))
      : appMode === "ai-code"
        ? CODE_MODELS.map((m) => ({ id: m.id, label: m.label, description: m.description }))
        : ALL_MODELS;

  const freeModels = visibleModels.filter((m) => !isModelPremiumOnly(m.id));
  const premiumModels = visibleModels.filter((m) => isModelPremiumOnly(m.id));

  const renderModelButton = (model: { id: string; label: string; description: string }) => {
    const requiresProPlus = isModelProPlusOnly(model.id);
    const requiresPremium = isModelPremiumOnly(model.id);
    const locked = requiresProPlus
      ? !isProPlus
      : requiresPremium && !isPremium;
    const lockReason = requiresProPlus
      ? `Pro+ plan required for ${model.label}`
      : `Pro plan required for ${model.label}`;
    return (
      <button
        key={model.id}
        type="button"
        onClick={() => !locked && onSelectModel(model.id)}
        className={`${pillBase} ${locked ? pillLocked : preferredModelId === model.id ? pillActive : pillInactive}`}
        title={locked ? lockReason : `Use ${model.label}`}
        aria-label={locked ? lockReason : undefined}
        aria-describedby={locked ? lockedDescId : undefined}
        disabled={locked}
      >
        {locked ? <Lock className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
        {model.label}
        {requiresProPlus && <Crown className="h-3 w-3 text-purple-400" aria-label="Pro+ exclusive" />}
        {model.description ? <span className="ml-1 text-xs text-slate-400">{model.description}</span> : null}
      </button>
    );
  };

  return (
    <div className="w-full">
      <button
        type="button"
        className="flex items-center gap-2 px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-semibold mb-2"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={modelListId}
      >
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        {open ? "Ukryj wybór modelu" : "Pokaż wybór modelu"}
      </button>
      {open && (
        <div
          id={modelListId}
          className="flex flex-wrap items-center gap-2 overflow-x-auto max-w-full scrollbar-thin scrollbar-thumb-slate-400 scrollbar-track-slate-100"
        >
          <button
            type="button"
            onClick={() => onSelectModel(null)}
            className={`${pillBase} ${isAuto ? pillActive : pillInactive}`}
            title="Automatically pick the best model for your request"
          >
            <Zap className="h-3 w-3" />
            Auto
          </button>

          {/* Visually-hidden description for locked models, referenced via aria-describedby */}
          <span id={lockedDescId} className="sr-only">
            This model requires a higher plan. Upgrade to unlock it.
          </span>

          {isPremium && (
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500">
              <Crown className="h-3 w-3" />
              {isProPlus ? "Pro+" : "Pro"}
            </span>
          )}

          {isPremium ? (
            <>
              <span className={sectionLabel}>
                <Code2 className="mr-0.5 inline h-3 w-3" />
                Premium Models
              </span>
              {premiumModels.map(renderModelButton)}
              <button
                type="button"
                className={`${pillBase} ${pillInactive}`}
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                aria-controls={moreModelsId}
              >
                {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                More models
              </button>
              {showMore && (
                <div id={moreModelsId} className="flex flex-wrap gap-2 w-full">
                  {freeModels.map(renderModelButton)}
                </div>
              )}
            </>
          ) : (
            <>
              <span className={sectionLabel}>
                <Code2 className="mr-0.5 inline h-3 w-3" />
                Free Models
              </span>
              {freeModels.map(renderModelButton)}
              <button
                type="button"
                className={`${pillBase} ${pillInactive}`}
                onClick={() => setShowMore((v) => !v)}
                aria-expanded={showMore}
                aria-controls={moreModelsId}
              >
                {showMore ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                More models
              </button>
              {showMore && (
                <div id={moreModelsId} className="flex flex-wrap gap-2 w-full">
                  {premiumModels.map(renderModelButton)}
                </div>
              )}
            </>
          )}

          {/* Thinking effort selector — shown only when a reasoning-capable model is active */}
          {preferredModelId && REASONING_MODEL_IDS.includes(preferredModelId) && onThinkingEffortChange && (
            <div className="flex w-full items-center gap-2 pt-1 mt-1 border-t border-slate-200 dark:border-slate-700">
              <span className={`flex items-center gap-1 ${sectionLabel}`}>
                <Brain className="h-3 w-3" />
                Thinking Effort:
              </span>
              {THINKING_EFFORTS.map((effort) => (
                <button
                  key={effort}
                  type="button"
                  onClick={() => onThinkingEffortChange(effort)}
                  className={`${pillBase} ${thinkingEffort === effort ? pillActive : pillInactive}`}
                  title={`Set thinking effort to ${effort}`}
                  aria-pressed={thinkingEffort === effort}
                >
                  {effort}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
