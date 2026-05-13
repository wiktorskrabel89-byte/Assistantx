"use client";

import {
  Bell,
  BookOpen,
  BrainCircuit,
  Check,
  Database,
  FolderKanban,
  Globe2,
  Grid2x2,
  LibraryBig,
  MessageSquareText,
  Plus,
  Search,
  Settings2,
  Share2,
  SquareTerminal,
  Stethoscope,
  X,
  type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useRef, useState, type ReactNode } from "react";
import type { AppMode } from "../lib/chat-types";
import { useWorkspace } from "../providers/WorkspaceProvider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AppNavigationTab =
  | "chat"
  | "clinical"
  | "sandbox"
  | "learning"
  | "projects"
  | "codebase"
  | "prompt-library"
  | "knowledge-export"
  | "settings"
  | "notifications"
  | "ai-learning"
  | "website-creator";

type AppNavigationColumnProps = {
  activeTab: AppNavigationTab;
  onSelectTab: (tab: AppNavigationTab) => void;
  notificationUnread?: number;
  appMode: AppMode;
  onSetAppMode: (mode: AppMode) => void;
  pinnedAddOns: string[];
  onSetPinnedAddOns: (ids: string[]) => void;
  /** User email for avatar initials */
  userEmail?: string | null;
  /** Whether the current user has admin role */
  isAdmin?: boolean;
  desktopAccessory?: ReactNode;
  mobileAccessory?: ReactNode;
};

type AddOnItem = {
  id: AppNavigationTab;
  label: string;
  description: string;
  icon: LucideIcon;
  beta?: boolean;
  adminOnly?: boolean;
};

/** The exact set of add-ons — no more, no less */
const ADD_ON_ITEMS: AddOnItem[] = [
  { id: "clinical",         label: "Clinical",        description: "Clinical tools",                   icon: Stethoscope },
  { id: "learning",         label: "Learning",        description: "Learning materials",               icon: BookOpen },
  { id: "prompt-library",   label: "Prompt Library",  description: "Prompt library",                   icon: LibraryBig },
  { id: "knowledge-export", label: "Knowledge Export", description: "Export knowledge",                icon: Share2 },
  { id: "website-creator",  label: "Website Creator", description: "Create and host an AI-powered site", icon: Globe2 },
  { id: "ai-learning",      label: "AI Learning",     description: "Memory + RAG + tuning controls", icon: BrainCircuit, adminOnly: true },
];

/** Core AI Code mode tabs — always visible in the sidebar when in AI Code mode.
 *  The keyboard shortcuts Ctrl+Shift+2/3/4 correspond to indices 0/1/2 (+2 offset). */
const CORE_CODE_TABS: { id: AppNavigationTab; label: string; icon: LucideIcon; shortcutNumber: number }[] = [
  { id: "sandbox",  label: "Sandbox",  icon: SquareTerminal, shortcutNumber: 2 },
  { id: "projects", label: "Projects", icon: FolderKanban,   shortcutNumber: 3 },
  { id: "codebase", label: "Codebase", icon: Database,       shortcutNumber: 4 },
];

const ADD_ON_IDS = new Set(ADD_ON_ITEMS.map((a) => a.id));

function getInitials(email: string | null | undefined): string {
  if (!email) return "?";
  const local = email.split("@")[0];
  const parts = local.split(/[._-]/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase();
}

export function AppNavigationColumn({
  activeTab,
  onSelectTab,
  notificationUnread = 0,
  appMode,
  onSetAppMode,
  pinnedAddOns,
  onSetPinnedAddOns,
  userEmail,
  isAdmin = false,
  desktopAccessory,
  mobileAccessory,
}: AppNavigationColumnProps) {
  const [appsOpen, setAppsOpen] = useState(false);
  const [appsSearch, setAppsSearch] = useState("");
  const [chatSearchLocal, setChatSearchLocal] = useState("");

  const {
    activeChat,
    activeWorkspace,
    setActiveChatId,
    createChatAction,
  } = useWorkspace();

  const visibleChats = chatSearchLocal.trim()
    ? activeWorkspace.chats.filter((c) =>
        c.title.toLowerCase().includes(chatSearchLocal.toLowerCase())
      )
    : activeWorkspace.chats;

  function handleSelectChat(chatId: string) {
    setActiveChatId(activeWorkspace.id, chatId);
    onSelectTab("chat");
  }

  const shellClassName = "border-sidebar-border bg-sidebar text-sidebar-foreground";
  const dividerClassName = "border-sidebar-border";

  /** Eligible add-ons for this user / mode */
  const eligibleAddOns = ADD_ON_ITEMS.filter((item) => {
    if (item.adminOnly && !isAdmin) return false;
    if (appsSearch.trim() !== "" &&
      !item.label.toLowerCase().includes(appsSearch.toLowerCase()) &&
      !item.description.toLowerCase().includes(appsSearch.toLowerCase())) return false;
    return true;
  });

  /** Pinned add-ons visible in sidebar (ordered by ADD_ON_ITEMS order) */
  const pinnedItems = ADD_ON_ITEMS.filter(
    (a) => pinnedAddOns.includes(a.id) && (a.adminOnly ? isAdmin : true)
  );

  function togglePin(id: string) {
    if (pinnedAddOns.includes(id)) {
      onSetPinnedAddOns(pinnedAddOns.filter((p) => p !== id));
    } else {
      onSetPinnedAddOns([...pinnedAddOns, id]);
    }
  }

  function handleSelectAddOn(id: AppNavigationTab) {
    onSelectTab(id);
    setAppsOpen(false);
  }

  const isChatActive = activeTab === "chat";
  const isAddOnActive = ADD_ON_IDS.has(activeTab);

  /** Ordered list of all tab IDs currently visible in the sidebar. */
  const visibleTabIds = useCallback((): AppNavigationTab[] => {
    const ids: AppNavigationTab[] = ["chat"];
    if (appMode === "ai-code") {
      CORE_CODE_TABS.forEach(({ id }) => ids.push(id));
    }
    pinnedItems.forEach(({ id }) => ids.push(id));
    return ids;
  }, [appMode, pinnedItems]);

  const tabsRef = useRef<HTMLDivElement>(null);

  /** Handle ArrowUp/ArrowDown keyboard navigation within the tablist. */
  const handleTabsKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const ids = visibleTabIds();
      const currentIndex = ids.indexOf(activeTab as AppNavigationTab);
      if (currentIndex === -1) return;
      event.preventDefault();
      const nextIndex =
        event.key === "ArrowDown"
          ? (currentIndex + 1) % ids.length
          : (currentIndex - 1 + ids.length) % ids.length;
      onSelectTab(ids[nextIndex]);
      // Move focus to the newly selected tab button
      const buttons = tabsRef.current?.querySelectorAll<HTMLButtonElement>("[role='tab']");
      buttons?.[nextIndex]?.focus();
    },
    [activeTab, onSelectTab, visibleTabIds],
  );

  function navButtonClass(isActive: boolean) {
    return `flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
      isActive
        ? "bg-sidebar-accent text-sidebar-accent-foreground"
        : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
    }`;
  }

  return (
    <>
    <aside className={`hidden min-h-0 overflow-hidden rounded-lg border xl:flex xl:w-[212px] xl:flex-col ${shellClassName}`}>
      {/* ── Logo ── */}
      <div className={`border-b px-4 py-4 ${dividerClassName}`}>
        <div className="flex items-center justify-between gap-2.5 px-1 py-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-sidebar-accent">
              <Image
                src="/icon-192.png"
                alt="AssistantX logo"
                width={22}
                height={22}
                fetchPriority="high"
                className="rounded-sm"
              />
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold tracking-tight">AssistantX</div>
              <div className="text-[10px] text-sidebar-foreground/50">AssistantX</div>
            </div>
          </div>
          {desktopAccessory}
        </div>

        {/* AI Chat / AI Code mode switcher */}
        <div className={`mt-3 flex rounded-lg border p-0.5 ${dividerClassName} bg-sidebar-accent/40`}>
          {(["ai-chat", "ai-code"] as AppMode[]).map((m) => {
            const isActive = appMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onSetAppMode(m)}
                className={`flex-1 rounded-[8px] py-1.5 text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? "bg-background text-foreground shadow-sm"
                    : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
                }`}
              >
                {m === "ai-chat" ? "AI Chat" : "AI Code"}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Core nav + Chats ── */}
      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">

      {/* Tabs section — keyboard navigable with ArrowUp/ArrowDown */}
      <div
        ref={tabsRef}
        role="tablist"
        aria-label="Workspace tabs"
        className="flex-shrink-0 overflow-y-auto px-3 pt-4 pb-1"
        onKeyDown={handleTabsKeyDown}
      >
        {/* Chat — always shown */}
        <button
          type="button"
          role="tab"
          aria-selected={isChatActive}
          onClick={() => onSelectTab("chat")}
          title="Chat (Ctrl+Shift+1)"
          aria-current={isChatActive ? "page" : undefined}
          className={navButtonClass(isChatActive)}
        >
          <MessageSquareText className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Chat</span>
        </button>

        {/* Core AI Code mode tabs — always visible when in AI Code mode */}
        {appMode === "ai-code" && (
          <div className="mt-1.5 space-y-0.5">
            {CORE_CODE_TABS.map(({ id, label, icon: Icon, shortcutNumber }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={activeTab === id}
                onClick={() => onSelectTab(id)}
                aria-current={activeTab === id ? "page" : undefined}
                title={`${label} (Ctrl+Shift+${shortcutNumber})`}
                className={navButtonClass(activeTab === id)}
              >
                <Icon className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Pinned add-ons — compact icon grid (2 columns) */}
        {pinnedItems.length > 0 && (
          <div className="mt-1.5 grid grid-cols-2 gap-1">
            {pinnedItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  onClick={() => onSelectTab(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  title={item.beta ? `${item.label} (Beta)` : item.label}
                  className={`flex flex-col items-center justify-center gap-1 rounded-lg py-2.5 text-[10px] font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sidebar-accent">
                      <Icon className="h-3.5 w-3.5 text-sidebar-foreground" />
                    </div>
                    {item.beta && (
                      <span className="absolute -right-1 -top-1 flex h-3 w-3 items-center justify-center rounded-full bg-violet-500 text-[6px] font-bold text-white ring-1 ring-white">β</span>
                    )}
                  </div>
                  <span className="w-full truncate text-center leading-none px-1">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}

        {/* Separator before apps button if anything above */}
        {(appMode === "ai-code" || pinnedItems.length > 0) && (
          <div className={`my-2 border-t ${dividerClassName}`} />
        )}

        {/* Apps / Add-ons button */}
        <button
          type="button"
          onClick={() => setAppsOpen((v: boolean) => !v)}
          title="Applications"
          className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200 ${
            isAddOnActive && !pinnedAddOns.includes(activeTab)
              ? "bg-sidebar-accent text-sidebar-accent-foreground"
              : appsOpen
                ? "bg-sidebar-accent/60 text-sidebar-accent-foreground"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
          }`}
        >
          <Grid2x2 className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 truncate text-left">Applications</span>
          {eligibleAddOns.filter((a) => !pinnedAddOns.includes(a.id)).length > 0 && !appsOpen && (
            <span className={`ml-auto text-[10px] font-normal opacity-50`}>
              {eligibleAddOns.filter((a) => !pinnedAddOns.includes(a.id)).length}
            </span>
          )}
        </button>

        {/* ── Apps drawer ── */}
        {appsOpen && (
          <div className={`mt-2 overflow-hidden rounded-lg border ${dividerClassName} bg-background`}>
            {/* Search */}
            <div className={`flex items-center gap-2 border-b px-3 py-2 ${dividerClassName}`}>
              <Search className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
              <Input
                id="apps-search-desktop"
                name="appsSearchDesktop"
                value={appsSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppsSearch(e.target.value)}
                placeholder="Search applications..."
                className="flex-1 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
              />
              {appsSearch && (
                <Button type="button" variant="ghost" size="icon" onClick={() => setAppsSearch("")} className="h-5 w-5 opacity-40 hover:opacity-70">
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>

            {/* Add-on list */}
            <div className="max-h-[380px] overflow-y-auto py-1.5">
              {eligibleAddOns.length === 0 && (
                <p className="px-4 py-3 text-xs opacity-50">No applications</p>
              )}
              {eligibleAddOns.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isPinned = pinnedAddOns.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-2 py-1.5 ${
                      isActive ? "bg-accent/50" : ""
                    }`}
                  >
                    {/* Clickable: navigate to tab */}
                    <button
                      type="button"
                      onClick={() => handleSelectAddOn(item.id)}
                      className="flex flex-1 min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:opacity-80"
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-3.5 w-3.5 text-foreground/70" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-foreground">{item.label}</span>
                          {item.beta && (
                            <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide bg-muted text-muted-foreground">Beta</span>
                          )}
                          {item.adminOnly && (
                            <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide bg-muted text-muted-foreground">Admin</span>
                          )}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">{item.description}</div>
                      </div>
                    </button>

                    {/* Pin toggle: Add to tabs / Added */}
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => togglePin(item.id)}
                      title={isPinned ? "Remove from tabs" : "Add to tabs"}
                      className={cn(
                        "h-6 w-6 flex-shrink-0 rounded-lg",
                        isPinned
                          ? "border-border bg-accent text-accent-foreground hover:bg-accent/80"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {isPinned
                        ? <Check className="h-3 w-3" />
                        : <Plus className="h-3 w-3" />
                      }
                    </Button>
                  </div>
                );
              })}
            </div>

            {/* Footer hint */}
            <div className={`border-t px-3 py-2 ${dividerClassName}`}>
              <p className="text-[10px] text-muted-foreground">
                Click <Plus className="inline h-2.5 w-2.5" /> to pin an application to the sidebar.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Chats section ── */}
      <div className="min-h-0 flex-1 flex flex-col">
        {/* Header row */}
        <div className={`flex flex-shrink-0 items-center justify-between border-t px-3 pt-2 pb-1.5 ${dividerClassName}`}>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Chats</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => { createChatAction(); onSelectTab("chat"); }}
            aria-label="New chat"
            className="h-5 w-5 rounded-md"
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 px-3 pb-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <Input
              id="nav-chat-search"
              name="navChatSearch"
              value={chatSearchLocal}
              onChange={(e) => setChatSearchLocal(e.target.value)}
              placeholder="Search chats…"
              className="w-full rounded-lg py-1 pl-6 pr-7 text-[11px] h-7 border-border bg-background/50 placeholder:text-muted-foreground"
            />
            {chatSearchLocal && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setChatSearchLocal("")}
                aria-label="Clear search"
                className="absolute right-1 top-1/2 h-5 w-5 -translate-y-1/2 opacity-50 hover:opacity-80"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Chat list — compact, scrollable */}
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {visibleChats.length === 0 ? (
            <p className="px-2 py-3 text-center text-[10px] text-slate-400">No chats found.</p>
          ) : (
            <div className="space-y-0.5">
              {visibleChats.map((chat) => {
                const isActive = chat.id === activeChat.id;
                return (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => handleSelectChat(chat.id)}
                    aria-current={isActive ? "page" : undefined}
                    title={chat.title}
                    className={`flex w-full items-center rounded-lg px-2.5 py-1.5 text-left transition-colors ${
                      isActive
                        ? "bg-sidebar-accent text-sidebar-accent-foreground"
                        : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium leading-tight">{chat.title}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      </div>{/* end Core nav + Chats */}

      {/* ── Bottom: account + quick settings ── */}
      <div className={`border-t px-3 py-3 ${dividerClassName}`}>
        <button
          type="button"
          onClick={() => onSelectTab("settings")}
          className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-sidebar-accent/60"
        >
          <Avatar className="h-8 w-8 flex-shrink-0 text-xs font-bold">
            <AvatarFallback className="bg-muted text-muted-foreground">
              {getInitials(userEmail)}
            </AvatarFallback>
          </Avatar>
          <span className="flex-1 truncate text-left text-sm text-sidebar-foreground/60">
            {userEmail ? userEmail.split("@")[0] : "Account"}
          </span>
          <Settings2 className="h-4 w-4 text-sidebar-foreground/60" />
        </button>

        <div className="mt-2 grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => onSelectTab("settings")}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors",
              activeTab === "settings"
                ? "bg-accent text-accent-foreground"
                : "text-foreground/70 hover:bg-accent/60 hover:text-accent-foreground"
            )}
          >
            <Settings2 className="h-3.5 w-3.5" />
            Settings
          </button>
          <button
            type="button"
            onClick={() => onSelectTab("notifications")}
            className={cn(
              "relative flex items-center justify-center gap-1.5 rounded-lg px-2 py-2 text-xs font-medium transition-colors",
              activeTab === "notifications"
                ? "bg-accent text-accent-foreground"
                : "text-foreground/70 hover:bg-accent/60 hover:text-accent-foreground"
            )}
          >
            <Bell className="h-3.5 w-3.5" />
            Alerts
            {notificationUnread > 0 ? (
              <Badge variant="destructive" className="absolute right-1 top-1 h-4 min-w-4 rounded-full px-1 text-[9px] font-bold">
                {notificationUnread > 99 ? "99+" : notificationUnread}
              </Badge>
            ) : null}
          </button>
        </div>
      </div>
    </aside>

      {/* ── Mobile compact icon strip (below xl) ── */}
      <TooltipProvider>
      <nav
        aria-label="App navigation"
        className={`xl:hidden flex flex-shrink-0 flex-col items-center gap-1 py-3 w-14 min-h-0 rounded-lg border ${shellClassName}`}
      >
        {/* Chat */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onSelectTab("chat")}
              title="Chat"
              aria-label="Chat"
              className={cn(
                "h-10 w-10 rounded-lg",
                isChatActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60"
              )}
            >
              <MessageSquareText className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Chat (Ctrl+Shift+1)</TooltipContent>
        </Tooltip>

        {/* Pinned add-ons */}
        {pinnedItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => onSelectTab(item.id)}
                  aria-label={item.label}
                  className={cn(
                    "h-10 w-10 rounded-lg",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}

        {/* Apps */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setAppsOpen((v: boolean) => !v)}
              title="Applications"
              aria-label="Applications"
              className={cn(
                "h-10 w-10 rounded-lg",
                appsOpen || (isAddOnActive && !pinnedAddOns.includes(activeTab))
                  ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60"
              )}
            >
              <Grid2x2 className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Applications</TooltipContent>
        </Tooltip>

        {mobileAccessory}

        <div className="flex-1" />

        {/* Settings */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onSelectTab("settings")}
              title="Settings"
              aria-label="Settings"
              className={cn(
                "h-10 w-10 rounded-lg",
                activeTab === "settings"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60"
              )}
            >
              <Settings2 className="h-5 w-5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings (Ctrl+Shift+,)</TooltipContent>
        </Tooltip>

        {/* Notifications */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onSelectTab("notifications")}
              title="Notifications"
              aria-label="Notifications"
              className={cn(
                "relative h-10 w-10 rounded-lg",
                activeTab === "notifications"
                  ? "bg-sidebar-accent text-sidebar-accent-foreground hover:bg-sidebar-accent/80"
                  : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60"
              )}
            >
              <Bell className="h-5 w-5" />
              {notificationUnread > 0 && (
                <Badge variant="destructive" className="absolute right-0.5 top-0.5 h-4 min-w-4 rounded-full px-1 text-[9px] font-bold">
                  {notificationUnread > 99 ? "99+" : notificationUnread}
                </Badge>
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">Notifications (Ctrl+Shift+.)</TooltipContent>
        </Tooltip>

        {/* User avatar */}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onSelectTab("settings")}
              aria-label={userEmail ?? "Account"}
              className="mt-1"
            >
              <Avatar className={cn("h-9 w-9 text-[11px] font-bold transition-colors", "hover:ring-2 hover:ring-border")}>
                <AvatarFallback className="bg-muted text-muted-foreground">
                  {getInitials(userEmail)}
                </AvatarFallback>
              </Avatar>
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">{userEmail ?? "Account"}</TooltipContent>
        </Tooltip>
      </nav>
      </TooltipProvider>

      {/* ── Mobile apps overlay (fixed, below xl) ── */}
      {appsOpen && (
        <div
          className="xl:hidden fixed inset-0 z-50 flex items-end justify-start p-4"
          onClick={() => setAppsOpen(false)}
        >
          <div
            className="max-h-[70vh] w-72 overflow-hidden rounded-xl border border-border bg-background shadow-2xl"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {/* Search */}
            <div className="flex items-center gap-2 border-b border-border px-3 py-2">
              <Search className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
              <Input
                id="apps-search-mobile"
                name="appsSearchMobile"
                value={appsSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppsSearch(e.target.value)}
                placeholder="Search applications..."
                className="flex-1 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
              />
              {appsSearch && (
                <Button type="button" variant="ghost" size="icon" onClick={() => setAppsSearch("")} className="h-5 w-5 opacity-40 hover:opacity-70">
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
            {/* Add-on list */}
            <div className="max-h-[55vh] overflow-y-auto py-1.5">
              {eligibleAddOns.length === 0 && (
                <p className="px-4 py-3 text-xs opacity-50">No applications</p>
              )}
              {eligibleAddOns.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isPinned = pinnedAddOns.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-2 py-1.5 ${isActive ? "bg-accent/50" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectAddOn(item.id)}
                      className="flex flex-1 min-w-0 items-center gap-2.5 rounded-lg px-1 py-1 text-left transition-colors hover:opacity-80"
                    >
                      <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-muted">
                        <Icon className="h-3.5 w-3.5 text-foreground/70" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-xs font-semibold text-foreground">{item.label}</span>
                          {item.beta && (
                            <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide bg-muted text-muted-foreground">Beta</span>
                          )}
                          {item.adminOnly && (
                            <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide bg-muted text-muted-foreground">Admin</span>
                          )}
                        </div>
                        <div className="truncate text-[10px] text-muted-foreground">{item.description}</div>
                      </div>
                    </button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      onClick={() => togglePin(item.id)}
                      title={isPinned ? "Remove from tabs" : "Add to tabs"}
                      className={cn(
                        "h-6 w-6 flex-shrink-0 rounded-lg",
                        isPinned
                          ? "border-border bg-accent text-accent-foreground hover:bg-accent/80"
                          : "border-border text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {isPinned ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-border px-3 py-2">
              <p className="text-[10px] text-muted-foreground">
                Click <Plus className="inline h-2.5 w-2.5" /> to pin to the sidebar.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
