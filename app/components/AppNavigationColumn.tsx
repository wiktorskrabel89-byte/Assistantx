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
import { useState } from "react";
import type { AppMode } from "../lib/chat-types";
import { useWorkspace } from "../providers/WorkspaceProvider";

export type AppNavigationTab =
  | "chat"
  | "clinical"
  | "knowledge"
  | "sandbox"
  | "learning"
  | "projects"
  | "codebase"
  | "prompt-library"
  | "knowledge-export"
  | "settings"
  | "notifications"
  | "ai-learning"
  | "jarvis"
  | "website-creator";

type AppNavigationColumnProps = {
  dark: boolean;
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
};

type AddOnItem = {
  id: AppNavigationTab;
  label: string;
  description: string;
  icon: LucideIcon;
  color: string;
  beta?: boolean;
  adminOnly?: boolean;
};

/** The exact set of add-ons — no more, no less */
const ADD_ON_ITEMS: AddOnItem[] = [
  { id: "jarvis",           label: "Jarvis",          description: "Asystent głosowy AI",   icon: BrainCircuit, color: "from-violet-500 to-purple-600", beta: true },
  { id: "clinical",         label: "Clinical",        description: "Narzędzia kliniczne",   icon: Stethoscope,  color: "from-emerald-500 to-teal-600" },
  { id: "knowledge",        label: "Knowledge",       description: "Pliki i pamięć wektorowa", icon: Database,   color: "from-cyan-500 to-sky-600" },
  { id: "learning",         label: "Learning",        description: "Materiały do nauki",    icon: BookOpen,     color: "from-sky-500 to-blue-600" },
  { id: "prompt-library",   label: "Prompt Library",  description: "Biblioteka promptów",   icon: LibraryBig,   color: "from-pink-500 to-rose-600" },
  { id: "knowledge-export", label: "Knowledge Export", description: "Eksportuj wiedzę",     icon: Share2,       color: "from-indigo-500 to-violet-600" },
  { id: "website-creator",  label: "Website Creator", description: "Stwórz i hostuj stronę AI", icon: Globe2,  color: "from-orange-500 to-amber-600" },
  { id: "ai-learning",      label: "AI Learning",     description: "Trenuj modele AI",      icon: BrainCircuit, color: "from-fuchsia-500 to-pink-600", adminOnly: true },
];

/** Core AI Code mode tabs — always visible in the sidebar when in AI Code mode */
const CORE_CODE_TABS: { id: AppNavigationTab; label: string; icon: LucideIcon }[] = [
  { id: "sandbox",  label: "Sandbox",  icon: SquareTerminal },
  { id: "projects", label: "Projekty", icon: FolderKanban },
  { id: "codebase", label: "Codebase", icon: Database },
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
  dark,
  activeTab,
  onSelectTab,
  notificationUnread = 0,
  appMode,
  onSetAppMode,
  pinnedAddOns,
  onSetPinnedAddOns,
  userEmail,
  isAdmin = false,
}: AppNavigationColumnProps) {
  const [appsOpen, setAppsOpen] = useState(false);
  const [appsSearch, setAppsSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
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

  const shellClassName = dark
    ? "border-slate-800 bg-slate-900 text-slate-100"
    : "border-sky-200/60 bg-white/92 text-slate-900 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.28)]";
  const dividerClassName = dark ? "border-slate-800" : "border-slate-200/80";

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

  function navButtonClass(isActive: boolean) {
    return `flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
      isActive
        ? dark ? "bg-slate-800 text-white" : "bg-gradient-to-r from-sky-700 to-cyan-600 text-white shadow-sm"
        : dark ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-700 hover:bg-sky-50"
    }`;
  }

  return (
    <>
    <aside className={`hidden min-h-0 overflow-hidden rounded-[26px] border xl:flex xl:w-[212px] xl:flex-col ${shellClassName}`}>
      {/* ── Logo ── */}
      <div className={`border-b px-4 py-4 ${dividerClassName}`}>
        <div className="rounded-2xl bg-gradient-to-br from-sky-700 via-cyan-600 to-amber-500 px-4 py-4 text-white shadow-sm">
          <div className="text-[1.35rem] font-bold tracking-tight">AssistantX</div>
          <div className="mt-1 text-xs text-white/90">Powered by AI</div>
        </div>

        {/* AI Chat / AI Code mode switcher */}
        <div className={`mt-3 flex rounded-xl border p-0.5 ${dark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"}`}>
          {(["ai-chat", "ai-code"] as AppMode[]).map((m) => {
            const isActive = appMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => onSetAppMode(m)}
                className={`flex-1 rounded-[10px] py-1.5 text-xs font-semibold transition-all duration-150 ${
                  isActive
                    ? dark ? "bg-slate-600 text-white shadow-sm" : "bg-white text-sky-700 shadow-sm"
                    : dark ? "text-slate-400 hover:text-slate-200" : "text-slate-500 hover:text-slate-700"
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

      {/* Tabs section */}
      <div className="flex-shrink-0 overflow-y-auto px-3 pt-4 pb-1">
        {/* Chat — always shown */}
        <button
          type="button"
          onClick={() => onSelectTab("chat")}
          aria-current={isChatActive ? "page" : undefined}
          className={navButtonClass(isChatActive)}
        >
          <MessageSquareText className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Chat</span>
        </button>

        {/* Core AI Code mode tabs — always visible when in AI Code mode */}
        {appMode === "ai-code" && (
          <div className="mt-1.5 space-y-0.5">
            {CORE_CODE_TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => onSelectTab(id)}
                aria-current={activeTab === id ? "page" : undefined}
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
                  onClick={() => onSelectTab(item.id)}
                  aria-current={isActive ? "page" : undefined}
                  title={item.beta ? `${item.label} (Beta)` : item.label}
                  className={`flex flex-col items-center justify-center gap-1 rounded-2xl py-2.5 text-[10px] font-medium transition-all duration-200 ${
                    isActive
                      ? dark ? "bg-slate-800 text-white" : "bg-gradient-to-br from-sky-700 to-cyan-600 text-white shadow-sm"
                      : dark ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-600 hover:bg-sky-50"
                  }`}
                >
                  <div className="relative flex-shrink-0">
                    <div className={`flex h-7 w-7 items-center justify-center rounded-xl bg-gradient-to-br ${item.color} shadow-sm`}>
                      <Icon className="h-3.5 w-3.5 text-white" />
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
          className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
            isAddOnActive && !pinnedAddOns.includes(activeTab)
              ? dark ? "bg-slate-800 text-white" : "bg-gradient-to-r from-sky-700 to-cyan-600 text-white shadow-sm"
              : appsOpen
                ? dark ? "bg-slate-800/60 text-white" : "bg-sky-50 text-sky-700"
                : dark ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-700 hover:bg-sky-50"
          }`}
        >
          <Grid2x2 className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 truncate text-left">Aplikacje</span>
          {eligibleAddOns.filter((a) => !pinnedAddOns.includes(a.id)).length > 0 && !appsOpen && (
            <span className={`ml-auto text-[10px] font-normal opacity-50`}>
              {eligibleAddOns.filter((a) => !pinnedAddOns.includes(a.id)).length}
            </span>
          )}
        </button>

        {/* ── Apps drawer ── */}
        {appsOpen && (
          <div className={`mt-2 overflow-hidden rounded-2xl border ${dark ? "border-slate-700 bg-slate-800/60" : "border-slate-200 bg-slate-50"}`}>
            {/* Search */}
            <div className={`flex items-center gap-2 border-b px-3 py-2 ${dark ? "border-slate-700" : "border-slate-200"}`}>
              <Search className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
              <input
                id="apps-search-desktop"
                name="appsSearchDesktop"
                value={appsSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppsSearch(e.target.value)}
                placeholder="Szukaj aplikacji..."
                className={`flex-1 bg-transparent text-xs outline-none placeholder-opacity-40 ${dark ? "placeholder-slate-500 text-slate-200" : "placeholder-slate-400 text-slate-700"}`}
              />
              {appsSearch && (
                <button type="button" onClick={() => setAppsSearch("")} className="opacity-40 hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {/* Add-on list */}
            <div className="max-h-[380px] overflow-y-auto py-1.5">
              {eligibleAddOns.length === 0 && (
                <p className="px-4 py-3 text-xs opacity-50">Brak aplikacji</p>
              )}
              {eligibleAddOns.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isPinned = pinnedAddOns.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-2 py-1.5 ${
                      isActive
                        ? dark ? "bg-slate-700/50" : "bg-sky-50/80"
                        : ""
                    }`}
                  >
                    {/* Clickable: navigate to tab */}
                    <button
                      type="button"
                      onClick={() => handleSelectAddOn(item.id)}
                      className="flex flex-1 min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 text-left transition-colors hover:opacity-80"
                    >
                      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${item.color} shadow-sm`}>
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`truncate text-xs font-semibold ${dark ? "text-slate-200" : "text-slate-700"}`}>{item.label}</span>
                          {item.beta && (
                            <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700">Beta</span>
                          )}
                          {item.adminOnly && (
                            <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700">Admin</span>
                          )}
                        </div>
                        <div className={`truncate text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>{item.description}</div>
                      </div>
                    </button>

                    {/* Pin toggle: Add to tabs / Added */}
                    <button
                      type="button"
                      onClick={() => togglePin(item.id)}
                      title={isPinned ? "Usuń z zakładek" : "Dodaj do zakładek"}
                      className={`flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-lg border transition-colors ${
                        isPinned
                          ? dark
                            ? "border-sky-600 bg-sky-900/50 text-sky-400"
                            : "border-sky-300 bg-sky-50 text-sky-600"
                          : dark
                            ? "border-slate-600 text-slate-400 hover:border-slate-400 hover:text-slate-200"
                            : "border-slate-300 text-slate-400 hover:border-slate-500 hover:text-slate-600"
                      }`}
                    >
                      {isPinned
                        ? <Check className="h-3 w-3" />
                        : <Plus className="h-3 w-3" />
                      }
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Footer hint */}
            <div className={`border-t px-3 py-2 ${dark ? "border-slate-700" : "border-slate-200"}`}>
              <p className={`text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>
                Kliknij <Plus className="inline h-2.5 w-2.5" /> aby przypiąć aplikację do paska bocznego.
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
          <button
            type="button"
            onClick={() => { createChatAction(); onSelectTab("chat"); }}
            title="New chat"
            aria-label="New chat"
            className={`flex h-5 w-5 items-center justify-center rounded-md transition-colors ${dark ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200" : "text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`}
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Search */}
        <div className="flex-shrink-0 px-3 pb-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
            <input
              id="nav-chat-search"
              name="navChatSearch"
              value={chatSearchLocal}
              onChange={(e) => setChatSearchLocal(e.target.value)}
              placeholder="Search chats…"
              className={`w-full rounded-lg border py-1 pl-6.5 pr-2 text-[11px] focus:outline-none ${dark ? "border-slate-700 bg-slate-800 text-slate-200 placeholder-slate-500" : "border-slate-200 bg-slate-50 text-slate-800 placeholder-slate-400"}`}
            />
            {chatSearchLocal && (
              <button
                type="button"
                onClick={() => setChatSearchLocal("")}
                title="Clear search"
                aria-label="Clear search"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 opacity-50 hover:opacity-80"
              >
                <X className="h-3 w-3" />
              </button>
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
                        ? dark ? "bg-slate-800 text-white" : "bg-sky-50 text-sky-800"
                        : dark ? "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
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

      {/* ── Bottom: settings panel or avatar pill ── */}
      <div className={`border-t px-3 py-3 ${dividerClassName}`}>
        {settingsOpen ? (
          /* Settings mini-panel */
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${dark ? "text-slate-500" : "text-slate-400"}`}>Konto & ustawienia</span>
              <button type="button" onClick={() => setSettingsOpen(false)} className={`rounded-lg p-0.5 ${dark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="space-y-0.5">
              {[
                { label: "Ustawienia", tab: "settings" as AppNavigationTab, icon: Settings2 },
                { label: "Powiadomienia", tab: "notifications" as AppNavigationTab, icon: Bell },
              ].map(({ label, tab, icon: Icon }) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { onSelectTab(tab); setSettingsOpen(false); }}
                  className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? dark ? "bg-slate-700 text-white" : "bg-sky-100 text-sky-800"
                      : dark ? "text-slate-300 hover:bg-slate-800" : "text-slate-600 hover:bg-slate-100"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 text-left">{label}</span>
                  {tab === "notifications" && notificationUnread > 0 && (
                    <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                      {notificationUnread > 99 ? "99+" : notificationUnread}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Avatar pill */
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className={`flex w-full items-center gap-2.5 rounded-2xl px-3 py-2 transition-colors ${
              dark ? "hover:bg-slate-800" : "hover:bg-slate-100"
            }`}
          >
            <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              dark ? "bg-slate-700 text-slate-200" : "bg-slate-200 text-slate-600"
            }`}>
              {getInitials(userEmail)}
            </div>
            <span className={`flex-1 truncate text-left text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
              {userEmail ? userEmail.split("@")[0] : "Konto"}
            </span>
            {notificationUnread > 0 && (
              <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                {notificationUnread > 99 ? "99+" : notificationUnread}
              </span>
            )}
          </button>
        )}
      </div>
    </aside>

      {/* ── Mobile compact icon strip (below xl) ── */}
      <nav
        aria-label="App navigation"
        className={`xl:hidden flex flex-shrink-0 flex-col items-center gap-1 py-3 w-14 min-h-0 rounded-[26px] border ${shellClassName}`}
      >
        {/* Chat */}
        <button
          type="button"
          onClick={() => onSelectTab("chat")}
          title="Chat"
          aria-label="Chat"
          className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
            isChatActive
              ? dark ? "bg-slate-800 text-white" : "bg-gradient-to-br from-sky-700 to-cyan-600 text-white shadow-sm"
              : dark ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-600 hover:bg-sky-50"
          }`}
        >
          <MessageSquareText className="h-5 w-5" />
        </button>

        {/* Pinned add-ons */}
        {pinnedItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              title={item.label}
              aria-label={item.label}
              className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
                isActive
                  ? dark ? "bg-slate-800 text-white" : "bg-gradient-to-br from-sky-700 to-cyan-600 text-white shadow-sm"
                  : dark ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-600 hover:bg-sky-50"
              }`}
            >
              <Icon className="h-5 w-5" />
            </button>
          );
        })}

        {/* Apps */}
        <button
          type="button"
          onClick={() => setAppsOpen((v: boolean) => !v)}
          title="Aplikacje"
          aria-label="Aplikacje"
          className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
            appsOpen || (isAddOnActive && !pinnedAddOns.includes(activeTab))
              ? dark ? "bg-slate-800 text-white" : "bg-gradient-to-br from-sky-700 to-cyan-600 text-white shadow-sm"
              : dark ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-600 hover:bg-sky-50"
          }`}
        >
          <Grid2x2 className="h-5 w-5" />
        </button>

        <div className="flex-1" />

        {/* Settings */}
        <button
          type="button"
          onClick={() => onSelectTab("settings")}
          title="Ustawienia"
          aria-label="Ustawienia"
          className={`flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
            activeTab === "settings"
              ? dark ? "bg-slate-800 text-white" : "bg-gradient-to-br from-sky-700 to-cyan-600 text-white shadow-sm"
              : dark ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-600 hover:bg-sky-50"
          }`}
        >
          <Settings2 className="h-5 w-5" />
        </button>

        {/* Notifications */}
        <button
          type="button"
          onClick={() => onSelectTab("notifications")}
          title="Powiadomienia"
          aria-label="Powiadomienia"
          className={`relative flex h-10 w-10 items-center justify-center rounded-2xl transition-colors ${
            activeTab === "notifications"
              ? dark ? "bg-slate-800 text-white" : "bg-gradient-to-br from-sky-700 to-cyan-600 text-white shadow-sm"
              : dark ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-600 hover:bg-sky-50"
          }`}
        >
          <Bell className="h-5 w-5" />
          {notificationUnread > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
              {notificationUnread > 99 ? "99+" : notificationUnread}
            </span>
          )}
        </button>

        {/* User avatar */}
        <button
          type="button"
          onClick={() => onSelectTab("settings")}
          title={userEmail ?? "Konto"}
          aria-label={userEmail ?? "Konto"}
          className={`mt-1 flex h-9 w-9 items-center justify-center rounded-full text-[11px] font-bold transition-colors ${
            dark ? "bg-slate-700 text-slate-200 hover:bg-slate-600" : "bg-slate-200 text-slate-600 hover:bg-slate-300"
          }`}
        >
          {getInitials(userEmail)}
        </button>
      </nav>

      {/* ── Mobile apps overlay (fixed, below xl) ── */}
      {appsOpen && (
        <div
          className="xl:hidden fixed inset-0 z-50 flex items-end justify-start p-4"
          onClick={() => setAppsOpen(false)}
        >
          <div
            className={`max-h-[70vh] w-72 overflow-hidden rounded-2xl border shadow-2xl ${
              dark ? "border-slate-700 bg-slate-900" : "border-slate-200 bg-white"
            }`}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            {/* Search */}
            <div className={`flex items-center gap-2 border-b px-3 py-2 ${dark ? "border-slate-700" : "border-slate-200"}`}>
              <Search className="h-3.5 w-3.5 flex-shrink-0 opacity-40" />
              <input
                id="apps-search-mobile"
                name="appsSearchMobile"
                value={appsSearch}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAppsSearch(e.target.value)}
                placeholder="Szukaj aplikacji..."
                className={`flex-1 bg-transparent text-xs outline-none ${
                  dark ? "placeholder-slate-500 text-slate-200" : "placeholder-slate-400 text-slate-700"
                }`}
              />
              {appsSearch && (
                <button type="button" onClick={() => setAppsSearch("")} className="opacity-40 hover:opacity-70">
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
            {/* Add-on list */}
            <div className="max-h-[55vh] overflow-y-auto py-1.5">
              {eligibleAddOns.length === 0 && (
                <p className="px-4 py-3 text-xs opacity-50">Brak aplikacji</p>
              )}
              {eligibleAddOns.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                const isPinned = pinnedAddOns.includes(item.id);
                return (
                  <div
                    key={item.id}
                    className={`flex items-center gap-2 px-2 py-1.5 ${isActive ? (dark ? "bg-slate-700/50" : "bg-sky-50/80") : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => handleSelectAddOn(item.id)}
                      className="flex flex-1 min-w-0 items-center gap-2.5 rounded-xl px-1 py-1 text-left transition-colors hover:opacity-80"
                    >
                      <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${item.color} shadow-sm`}>
                        <Icon className="h-3.5 w-3.5 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`truncate text-xs font-semibold ${dark ? "text-slate-200" : "text-slate-700"}`}>{item.label}</span>
                          {item.beta && (
                            <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700">Beta</span>
                          )}
                          {item.adminOnly && (
                            <span className="rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide bg-amber-100 text-amber-700">Admin</span>
                          )}
                        </div>
                        <div className={`truncate text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>{item.description}</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => togglePin(item.id)}
                      title={isPinned ? "Usuń z zakładek" : "Dodaj do zakładek"}
                      className={`flex-shrink-0 flex h-6 w-6 items-center justify-center rounded-lg border transition-colors ${
                        isPinned
                          ? dark ? "border-sky-600 bg-sky-900/50 text-sky-400" : "border-sky-300 bg-sky-50 text-sky-600"
                          : dark ? "border-slate-600 text-slate-400 hover:border-slate-400" : "border-slate-300 text-slate-400 hover:border-slate-500"
                      }`}
                    >
                      {isPinned ? <Check className="h-3 w-3" /> : <Plus className="h-3 w-3" />}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className={`border-t px-3 py-2 ${dark ? "border-slate-700" : "border-slate-200"}`}>
              <p className={`text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>
                Kliknij <Plus className="inline h-2.5 w-2.5" /> aby przypiąć do paska bocznego.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
