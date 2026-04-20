"use client";

import { COST_MODE_OPTIONS } from "../lib/chat-state";
import type { CostMode } from "@/lib/ai-config";

type CostModeSelectorProps = {
  dark: boolean;
  costMode: CostMode;
  onSelectCostMode: (costMode: CostMode) => void;
};

export function CostModeSelector({ dark, costMode, onSelectCostMode }: CostModeSelectorProps) {
  const pillBase = "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors cursor-pointer select-none";
  const pillActive = dark
    ? "border-emerald-700 bg-emerald-950/40 text-emerald-200"
    : "border-emerald-300 bg-emerald-50 text-emerald-700";
  const pillInactive = dark
    ? "border-slate-700 bg-slate-900 text-slate-400 hover:bg-slate-800"
    : "border-slate-200 bg-white text-slate-500 hover:bg-slate-100";

  const labelClass = `text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-slate-500" : "text-slate-400"}`;

  return (
    <div className="flex items-center gap-2">
      <span className={labelClass}>Cost</span>
      {COST_MODE_OPTIONS.map((option) => (
        <button
          key={option.id}
          onClick={() => onSelectCostMode(option.id)}
          className={`${pillBase} ${costMode === option.id ? pillActive : pillInactive}`}
          title={option.description}
        >
          <span>{option.icon}</span>
          {option.label}
        </button>
      ))}
    </div>
  );
}
