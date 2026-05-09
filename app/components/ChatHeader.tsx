"use client";

import { BarChart2, Braces, Menu, MessageSquareText, Plus, PlugZap, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

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
  const iconBtnCn = `hidden h-10 w-10 lg:flex ${dark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 hover:text-slate-100" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"}`;

  return (
    <div className="border-b border-slate-200 bg-white/85 px-4 py-3 backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <TooltipProvider>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={onOpenSidebar}
              className="h-10 w-10 rounded-xl border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300 xl:hidden"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-700 via-cyan-600 to-amber-500 text-white shadow-sm">
              <AssistantIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-slate-900 dark:text-white">{assistantName}</div>
              <div className="truncate text-xs text-slate-500">{activeChatTitle}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={onOpenSessions} className={iconBtnCn} aria-label="Open sessions panel">
                  <MessageSquareText className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Sessions</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={onOpenCodeHistory} className={iconBtnCn} aria-label="Open code history panel">
                  <Braces className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Code history</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={onOpenAiTools} className={iconBtnCn} aria-label="Open AI tools panel">
                  <Sparkles className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>AI tools</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={onOpenApps} className={iconBtnCn} aria-label="Open apps panel">
                  <PlugZap className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Apps</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={onOpenWorkspaceTools} className={iconBtnCn} aria-label="Open workspace tools panel">
                  <Wrench className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Workspace tools</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" onClick={onOpenUsage} className={iconBtnCn} aria-label="Open usage dashboard">
                  <BarChart2 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Usage dashboard</TooltipContent>
            </Tooltip>

            <Button
              variant="outline"
              onClick={onOpenAgentManager}
              className={`hidden rounded-xl text-sm font-medium md:flex ${dark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700"}`}
            >
              New agent
            </Button>

            <Button
              variant="outline"
              onClick={onOpenShare}
              className={`hidden rounded-xl text-sm font-medium sm:flex ${dark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700"}`}
            >
              Share
            </Button>

            <Button
              variant="outline"
              onClick={onOpenPrompts}
              className={`hidden rounded-xl text-sm font-medium sm:flex ${dark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700"}`}
            >
              Prompts
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onCreateChat}
                  className={`h-10 w-10 rounded-xl ${dark ? "border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800" : "border-slate-200 bg-white text-slate-700"}`}
                  aria-label="New chat"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>New chat</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </TooltipProvider>
    </div>
  );
}
