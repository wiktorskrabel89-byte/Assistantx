"use client";

import {
  Bell,
  BookOpen,
  BrainCircuit,
  CodeXml,
  Database,
  FolderKanban,
  Grid2x2,
  LibraryBig,
  MessageSquareText,
  PlugZap,
  Search,
  Settings2,
  Share2,
  SquareTerminal,
  Stethoscope,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { AppMode } from "../lib/chat-types";

export type AppNavigationTab =
  | "chat"
  | "clinical"
  | "sandbox"
  | "learning"
  | "projects"
  | "codebase"
  | "scripts"
  | "prompt-library"
  | "knowledge-export"
  | "settings"
  | "notifications"
  | "ai-learning"
  | "jarvis";

type AppNavigationColumnProps = {
  dark: boolean;
  activeTab: AppNavigationTab;
  onSelectTab: (tab: AppNavigationTab) => void;
  notificationUnread?: number;
  appMode: AppMode;
  onSetAppMode: (mode: AppMode) => void;
  hiddenTabs: string[];
  onSetHiddenTabs: (tabs: string[]) => void;
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

const ADD_ON_ITEMS: AddOnItem[] = [
  { id: "jarvis",           label: "Jarvis",          description: "Asystent głosowy AI",        icon: BrainCircuit,  color: "from-violet-500 to-purple-600", beta: true },
  { id: "clinical",         label: "Clinical",        description: "Narzędzia kliniczne",        icon: Stethoscope,   color: "from-emerald-500 to-teal-600" },
  { id: "sandbox",          label: "Sandbox",         description: "Środowisko testowe",         icon: SquareTerminal, color: "from-slate-500 to-slate-700" },
  { id: "learning",         label: "Learning",        description: "Materiały do nauki",         icon: BookOpen,      color: "from-sky-500 to-blue-600" },
  { id: "projects",         label: "Projekty",        description: "Zarządzaj projektami",       icon: FolderKanban,  color: "from-amber-500 to-orange-600" },
  { id: "codebase",         label: "Codebase",        description: "Przeglądaj kod",             icon: Database,      color: "from-cyan-500 to-sky-600" },
  { id: "scripts",          label: "Scripts",         description: "Automatyzacja skryptów",     icon: CodeXml,       color: "from-lime-500 to-green-600" },
  { id: "prompt-library",   label: "Prompt Library",  description: "Biblioteka promptów",        icon: LibraryBig,    color: "from-pink-500 to-rose-600" },
  { id: "knowledge-export", label: "Knowledge Export", description: "Eksportuj wiedzę",         icon: Share2,        color: "from-indigo-500 to-violet-600" },
  { id: "ai-learning",      label: "AI Learning",     description: "Trenuj modele AI",           icon: BrainCircuit,  color: "from-fuchsia-500 to-pink-600", adminOnly: true },
];

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
  hiddenTabs,
  onSetHiddenTabs,
  userEmail,
  isAdmin = false,
}: AppNavigationColumnProps) {
  const [appsOpen, setAppsOpen] = useState(false);
  const [appsSearch, setAppsSearch] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  const shellClassName = dark
    ? "border-slate-800 bg-slate-900 text-slate-100"
    : "border-sky-200/60 bg-white/92 text-slate-900 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.28)]";
  const dividerClassName = dark ? "border-slate-800" : "border-slate-200/80";

  const filteredAddOns = ADD_ON_ITEMS.filter((item) =>
    !hiddenTabs.includes(item.id) &&
    (appMode === "ai-code" || item.id === "jarvis") &&
    (!item.adminOnly || isAdmin) &&
    (appsSearch.trim() === "" || item.label.toLowerCase().includes(appsSearch.toLowerCase()) || item.description.toLowerCase().includes(appsSearch.toLowerCase()))
  );

  function handleSelectAddOn(id: AppNavigationTab) {
    onSelectTab(id);
    setAppsOpen(false);
  }

  const isChatActive = activeTab === "chat";
  const isAddOnActive = ADD_ON_ITEMS.some((a) => a.id === activeTab);

  return (
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

      {/* ── Core nav ── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {/* Chat — always shown */}
        <button
          type="button"
          onClick={() => onSelectTab("chat")}
          aria-current={isChatActive ? "page" : undefined}
          className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
            isChatActive
              ? dark ? "bg-slate-800 text-white" : "bg-gradient-to-r from-sky-700 to-cyan-600 text-white shadow-sm"
              : dark ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-700 hover:bg-sky-50"
          }`}
        >
          <MessageSquareText className="h-4 w-4 flex-shrink-0" />
          <span className="truncate">Chat</span>
        </button>

        {/* Apps / Add-ons button */}
        <button
          type="button"
          onClick={() => setAppsOpen((v: boolean) => !v)}
          className={`mt-1.5 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ${
            isAddOnActive
              ? dark ? "bg-slate-800 text-white" : "bg-gradient-to-r from-sky-700 to-cyan-600 text-white shadow-sm"
              : appsOpen
                ? dark ? "bg-slate-800/60 text-white" : "bg-sky-50 text-sky-700"
                : dark ? "text-slate-300 hover:bg-slate-800/80" : "text-slate-700 hover:bg-sky-50"
          }`}
        >
          <Grid2x2 className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1 truncate text-left">Aplikacje</span>
          {isAddOnActive && ADD_ON_ITEMS.find((a) => a.id === activeTab) && (
            <span className={`ml-auto max-w-[70px] truncate text-[10px] font-normal opacity-75`}>
              {ADD_ON_ITEMS.find((a) => a.id === activeTab)?.label}
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
            <div className="max-h-[340px] overflow-y-auto py-1.5">
              {filteredAddOns.length === 0 && (
                <p className="px-4 py-3 text-xs opacity-50">Brak aplikacji</p>
              )}
              {filteredAddOns.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSelectAddOn(item.id)}
                    className={`flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                      isActive
                        ? dark ? "bg-slate-700 text-white" : "bg-sky-100 text-sky-800"
                        : dark ? "text-slate-300 hover:bg-slate-700/60" : "text-slate-700 hover:bg-white"
                    }`}
                  >
                    <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${item.color} shadow-sm`}>
                      <Icon className="h-3.5 w-3.5 text-white" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 truncate text-xs font-semibold">
                        {item.label}
                        {item.beta && (
                          <span className="rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">Beta</span>
                        )}
                      </div>
                      <div className={`truncate text-[10px] ${dark ? "text-slate-500" : "text-slate-400"}`}>{item.description}</div>
                    </div>
                    {isActive && <span className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-sky-500" />}
                  </button>
                );
              })}
            </div>

            {/* Manage visibility link */}
            <div className={`border-t px-3 py-2 ${dark ? "border-slate-700" : "border-slate-200"}`}>
              <Link
                href="/integrations"
                className={`flex items-center gap-1.5 text-[10px] font-medium transition-colors ${dark ? "text-slate-500 hover:text-slate-300" : "text-slate-400 hover:text-slate-600"}`}
              >
                <PlugZap className="h-3 w-3" />
                Integracje i zarządzanie
              </Link>
            </div>
          </div>
        )}
      </div>

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
  );
}

