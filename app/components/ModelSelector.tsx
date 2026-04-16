"use client";

import { Bot, Code2, Crown, Lock, MessageSquareText, Zap } from "lucide-react";
import { MODEL_PRESETS } from "../lib/chat-state";
import { COST_TIER_LABELS, isModelPremiumOnly, type CostTier } from "@/lib/ai-config";

type ModelSelectorProps = {
  dark: boolean;
  preferredModelId: string | null;
  isPremium: boolean;
  onSelectModel: (modelId: string | null) => void;
};

export function ModelSelector({ dark, preferredModelId, isPremium, onSelectModel }: ModelSelectorProps) {
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

  const tierBadge = (tier: CostTier) => {
    const label = COST_TIER_LABELS[tier];
    if (!label) return null;
    const color = tier === "free"
      ? "text-emerald-500"
      : tier === "cheap"
        ? "text-sky-500"
        : tier === "standard"
          ? "text-amber-500"
          : "text-rose-500";
    return <span className={`ml-0.5 text-[9px] font-bold ${color}`}>{label}</span>;
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
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
          Premium
        </span>
      )}

      <span className={sectionLabel}>
        <Code2 className="mr-0.5 inline h-3 w-3" />
        Coding
      </span>
      {MODEL_PRESETS.coding.map((preset) => {
        const locked = !isPremium && isModelPremiumOnly(preset.modelId);
        return (
          <button
            key={preset.id}
            onClick={() => !locked && onSelectModel(preset.modelId)}
            className={`${pillBase} ${locked ? pillLocked : preferredModelId === preset.modelId ? pillActive : pillInactive}`}
            title={locked ? `Premium plan required for ${preset.label}` : `Use ${preset.label} for coding`}
            disabled={locked}
          >
            {locked ? <Lock className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
            {preset.label}
            {tierBadge(preset.costTier)}
          </button>
        );
      })}

      <span className={sectionLabel}>
        <MessageSquareText className="mr-0.5 inline h-3 w-3" />
        Chat
      </span>
      {MODEL_PRESETS.chat.map((preset) => {
        const locked = !isPremium && isModelPremiumOnly(preset.modelId);
        return (
          <button
            key={preset.id}
            onClick={() => !locked && onSelectModel(preset.modelId)}
            className={`${pillBase} ${locked ? pillLocked : preferredModelId === preset.modelId ? pillActive : pillInactive}`}
            title={locked ? `Premium plan required for ${preset.label}` : `Use ${preset.label} for chatting`}
            disabled={locked}
          >
            {locked ? <Lock className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
            {preset.label}
            {tierBadge(preset.costTier)}
          </button>
        );
      })}
    </div>
  );
}
