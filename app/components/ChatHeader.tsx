"use client";

import { BarChart2, Braces, Menu, MessageSquareText, Plus, PlugZap, Sparkles, Wrench, type LucideIcon } from "lucide-react";

type ChatHeaderProps = {
  dark: boolean;
  inputBg: string;
  assistantIcon: LucideIcon;
  assistantName: string;
  activeChatTitle: string;
  onOpenSidebar: () => void;
  onOpenAgentManager: () => void;
  onOpenSessions: () => void;
  onOpenCodeHistory: () => void;
  onOpenAiTools: () => void;
  onOpenApps: () => void;
  onOpenShare: () => void;
  onOpenPrompts: () => void;
  onCreateChat: () => void;
  onOpenWorkspaceTools: () => void;
  onOpenUsage: () => void;
};

export function ChatHeader({
  dark,
  inputBg,
  assistantIcon: AssistantIcon,
  assistantName,
  activeChatTitle,
  onOpenSidebar,
  onOpenAgentManager,
  onOpenSessions,
  onOpenCodeHistory,
  onOpenAiTools,
  onOpenApps,
  onOpenShare,
  onOpenPrompts,
  onCreateChat,
  onOpenWorkspaceTools,
  onOpenUsage,
}: ChatHeaderProps) {
  const toolButtonClassName = `hidden h-10 w-10 items-center justify-center rounded-xl border lg:flex ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`;

  return (
    <div className="border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onOpenSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300 xl:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-700 via-cyan-600 to-amber-500 text-white shadow-sm">
            <AssistantIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900 dark:text-white">{assistantName}</div>
            <div className="truncate text-xs text-slate-500">{activeChatTitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={onOpenSessions} className={toolButtonClassName} title="Sessions" aria-label="Open sessions panel">
            <MessageSquareText className="h-4 w-4" />
          </button>

          <button onClick={onOpenCodeHistory} className={toolButtonClassName} title="Code history" aria-label="Open code history panel">
            <Braces className="h-4 w-4" />
          </button>

          <button onClick={onOpenAiTools} className={toolButtonClassName} title="AI tools" aria-label="Open AI tools panel">
            <Sparkles className="h-4 w-4" />
          </button>

          <button onClick={onOpenApps} className={toolButtonClassName} title="Apps" aria-label="Open apps panel">
            <PlugZap className="h-4 w-4" />
          </button>

          <button onClick={onOpenWorkspaceTools} className={toolButtonClassName} title="Workspace tools" aria-label="Open workspace tools panel">
            <Wrench className="h-4 w-4" />
          </button>

          <button onClick={onOpenUsage} className={toolButtonClassName} title="Usage dashboard" aria-label="Open usage dashboard">
            <BarChart2 className="h-4 w-4" />
          </button>

          <button
            onClick={onOpenAgentManager}
            className={`hidden rounded-xl border px-3 py-2 text-sm font-medium md:block ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}
          >
            New agent
          </button>

          <button
            onClick={onOpenShare}
            className={`hidden rounded-xl border px-3 py-2 text-sm font-medium sm:block ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}
          >
            Share
          </button>

          <button
            onClick={onOpenPrompts}
            className={`hidden rounded-xl border px-3 py-2 text-sm font-medium sm:block ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}
          >
            Prompts
          </button>

          <button
            onClick={onCreateChat}
            className={`flex h-10 w-10 items-center justify-center rounded-xl border ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}
            title="New chat"
            aria-label="New chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
