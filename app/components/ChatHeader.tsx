"use client";

import { Menu, Plus, type LucideIcon } from "lucide-react";
import type { BuiltInAgent, CustomAgent, SidebarTab, ToolbarTab } from "../lib/chat-types";

type ChatHeaderProps = {
  dark: boolean;
  inputBg: string;
  sidebarTab: SidebarTab;
  assistantIcon: LucideIcon;
  assistantName: string;
  activeChatTitle: string;
  activeAgentId: string;
  builtInAgents: BuiltInAgent[];
  customAgents: CustomAgent[];
  toolbarTabs: ToolbarTab[];
  onOpenSidebar: () => void;
  onSelectAgent: (agentId: string) => void;
  onOpenAgentManager: () => void;
  onSelectTab: (tabId: SidebarTab) => void;
  onOpenSessions: () => void;
  onOpenAiTools: () => void;
  onOpenShare: () => void;
  onOpenPrompts: () => void;
  onCreateChat: () => void;
};

export function ChatHeader({
  dark,
  inputBg,
  sidebarTab,
  assistantIcon: AssistantIcon,
  assistantName,
  activeChatTitle,
  activeAgentId,
  builtInAgents,
  customAgents,
  toolbarTabs,
  onOpenSidebar,
  onSelectAgent,
  onOpenAgentManager,
  onSelectTab,
  onOpenSessions,
  onOpenAiTools,
  onOpenShare,
  onOpenPrompts,
  onCreateChat,
}: ChatHeaderProps) {
  return (
    <div className="border-b border-slate-200 bg-white/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            onClick={onOpenSidebar}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300 xl:hidden"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-500 text-white shadow-sm">
            <AssistantIcon className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-slate-900 dark:text-white">{assistantName}</div>
            <div className="truncate text-xs text-slate-500">{activeChatTitle}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={activeAgentId}
            onChange={(event) => onSelectAgent(event.target.value)}
            className={`hidden rounded-xl border px-3 py-2 text-sm md:block ${inputBg}`}
          >
            {builtInAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
            {customAgents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.name}</option>
            ))}
          </select>

          <button
            onClick={onOpenAgentManager}
            className={`hidden rounded-xl border px-3 py-2 text-sm font-medium md:block ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}
          >
            Agents
          </button>

          {toolbarTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => onSelectTab(tab.id)}
                title={tab.label}
                aria-label={tab.label}
                className={`flex h-10 w-10 items-center justify-center rounded-xl border transition-colors ${
                  sidebarTab === tab.id
                    ? dark
                      ? "border-blue-800 bg-blue-950/40 text-blue-200"
                      : "border-blue-200 bg-blue-50 text-blue-700"
                    : dark
                      ? "border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800"
                      : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            );
          })}

          <button
            onClick={onOpenSessions}
            className={`hidden rounded-xl border px-3 py-2 text-sm font-medium sm:block ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}
          >
            Sessions
          </button>

          <button
            onClick={onOpenAiTools}
            className={`hidden rounded-xl border px-3 py-2 text-sm font-medium sm:block ${dark ? "border-slate-700 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}
          >
            AI Tools
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