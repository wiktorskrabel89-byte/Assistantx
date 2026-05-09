"use client";

import { BarChart2, Braces, Menu, MessageSquareText, Plus, PlugZap, Sparkles, Wrench, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type ChatHeaderProps = {
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
  const iconBtnCn = "hidden h-10 w-10 lg:flex border-border bg-background text-foreground/70 hover:bg-accent hover:text-foreground";

  return (
    <div className="border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm">
      <TooltipProvider>
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <Button
              variant="outline"
              size="icon"
              onClick={onOpenSidebar}
              className="h-10 w-10 rounded-lg border-border text-foreground/70 xl:hidden"
            >
              <Menu className="h-4 w-4" />
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground/70">
              <AssistantIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-base font-semibold text-foreground">{assistantName}</div>
              <div className="truncate text-xs text-muted-foreground">{activeChatTitle}</div>
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
              className="hidden rounded-lg text-sm font-medium md:flex border-border bg-background text-foreground/70 hover:bg-accent"
            >
              New agent
            </Button>

            <Button
              variant="outline"
              onClick={onOpenShare}
              className="hidden rounded-lg text-sm font-medium sm:flex border-border bg-background text-foreground/70 hover:bg-accent"
            >
              Share
            </Button>

            <Button
              variant="outline"
              onClick={onOpenPrompts}
              className={cn("hidden rounded-lg text-sm font-medium sm:flex border-border bg-background text-foreground/70 hover:bg-accent")}
            >
              Prompts
            </Button>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={onCreateChat}
                  className={cn("h-10 w-10 rounded-lg border-border bg-background text-foreground/70 hover:bg-accent")}
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
