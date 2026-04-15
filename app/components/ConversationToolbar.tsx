"use client";

import { Braces, MessageSquareText, PlugZap, Sparkles } from "lucide-react";

type ConversationToolbarProps = {
  dark: boolean;
  sessionCount: number;
  artifactCount: number;
  onOpenSessions: () => void;
  onOpenCodeHistory: () => void;
  onOpenAiTools: () => void;
  onOpenApps: () => void;
};

export function ConversationToolbar({
  dark,
  sessionCount,
  artifactCount,
  onOpenSessions,
  onOpenCodeHistory,
  onOpenAiTools,
  onOpenApps,
}: ConversationToolbarProps) {
  const buttonClassName = `inline-flex items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${dark ? "border-slate-800 bg-slate-900 text-slate-100 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-100"}`;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <button onClick={onOpenSessions} className={buttonClassName}>
        <MessageSquareText className="h-4 w-4" />
        <span>Sessions</span>
        <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-xs text-blue-500">{sessionCount}</span>
      </button>
      <button onClick={onOpenCodeHistory} className={buttonClassName}>
        <Braces className="h-4 w-4" />
        <span>Code history</span>
        <span className="rounded-full bg-cyan-500/10 px-2 py-0.5 text-xs text-cyan-500">{artifactCount}</span>
      </button>
      <button onClick={onOpenAiTools} className={buttonClassName}>
        <Sparkles className="h-4 w-4" />
        <span>AI tools</span>
      </button>
      <button onClick={onOpenApps} className={buttonClassName}>
        <PlugZap className="h-4 w-4" />
        <span>Apps</span>
      </button>
    </div>
  );
}