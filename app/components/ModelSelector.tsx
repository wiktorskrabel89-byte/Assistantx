"use client";

import { Bot, Code2, MessageSquareText, Zap } from "lucide-react";
import { MODEL_PRESETS } from "../lib/chat-state";

type ModelSelectorProps = {
  dark: boolean;
  preferredModelId: string | null;
  onSelectModel: (modelId: string | null) => void;
};

export function ModelSelector({ dark, preferredModelId, onSelectModel }: ModelSelectorProps) {
  const isAuto = preferredModelId === null;

  const pillBase = "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer select-none";
  const pillActive = dark
    ? "border-blue-700 bg-blue-950/40 text-blue-200"
    : "border-blue-300 bg-blue-50 text-blue-700";
  const pillInactive = dark
    ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100";

  const sectionLabel = `text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-slate-500" : "text-slate-400"}`;

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

      <span className={sectionLabel}>
        <Code2 className="mr-0.5 inline h-3 w-3" />
        Coding
      </span>
      {MODEL_PRESETS.coding.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onSelectModel(preset.modelId)}
          className={`${pillBase} ${preferredModelId === preset.modelId ? pillActive : pillInactive}`}
          title={`Use ${preset.label} for coding`}
        >
          <Bot className="h-3 w-3" />
          {preset.label}
        </button>
      ))}

      <span className={sectionLabel}>
        <MessageSquareText className="mr-0.5 inline h-3 w-3" />
        Chat
      </span>
      {MODEL_PRESETS.chat.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onSelectModel(preset.modelId)}
          className={`${pillBase} ${preferredModelId === preset.modelId ? pillActive : pillInactive}`}
          title={`Use ${preset.label} for chatting`}
        >
          <Bot className="h-3 w-3" />
          {preset.label}
        </button>
      ))}
    </div>
  );
}
