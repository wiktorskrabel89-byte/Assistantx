"use client";

import {
  BarChart2,
  Bell,
  BookOpen,
  BrainCircuit,
  CodeXml,
  Database,
  FolderKanban,
  LibraryBig,
  MessageSquareText,
  PlugZap,
  Settings2,
  Share2,
  SlidersHorizontal,
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
  | "stats"
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
};

type AppNavigationItem = {
  id: AppNavigationTab;
  label: string;
  icon: LucideIcon;
  /** Which modes show this tab by default (before user customisation) */
  modes: AppMode[];
  /** Whether it can ever be hidden by the user (Chat is always pinned) */
  pinned?: boolean;
};

const APP_NAVIGATION_ITEMS: AppNavigationItem[] = [
  { id: "jarvis",           label: "Jarvis",          icon: BrainCircuit,     modes: ["ai-code"] },
  { id: "chat",             label: "Chat",             icon: MessageSquareText, modes: ["ai-chat", "ai-code"], pinned: true },
  { id: "clinical",         label: "Clinical",         icon: Stethoscope,      modes: ["ai-code"] },
  { id: "sandbox",          label: "Sandbox",          icon: SquareTerminal,   modes: ["ai-code"] },
  { id: "learning",         label: "Learning",         icon: BookOpen,         modes: ["ai-code"] },
  { id: "projects",         label: "Projekty",         icon: FolderKanban,     modes: ["ai-code"] },
  { id: "codebase",         label: "Codebase",         icon: Database,         modes: ["ai-code"] },
  { id: "scripts",          label: "Scripts",          icon: CodeXml,          modes: ["ai-code"] },
  { id: "prompt-library",   label: "Prompt Library",   icon: LibraryBig,       modes: ["ai-code"] },
  { id: "knowledge-export", label: "Knowledge Export", icon: Share2,           modes: ["ai-code"] },
  { id: "stats",            label: "Statystyki",       icon: BarChart2,        modes: ["ai-code"] },
  { id: "settings",         label: "Ustawienia",       icon: Settings2,        modes: ["ai-chat", "ai-code"] },
  { id: "notifications",    label: "Powiadomienia",    icon: Bell,             modes: ["ai-chat", "ai-code"] },
  { id: "ai-learning",      label: "AI Learning",      icon: BrainCircuit,     modes: ["ai-code"] },
];

export function AppNavigationColumn({
  dark,
  activeTab,
  onSelectTab,
  notificationUnread = 0,
  appMode,
  onSetAppMode,
  hiddenTabs,
  onSetHiddenTabs,
}: AppNavigationColumnProps) {
  const [customiseOpen, setCustomiseOpen] = useState(false);

  const shellClassName = dark
    ? "border-slate-800 bg-slate-900 text-slate-100"
    : "border-sky-200/60 bg-white/92 text-slate-900 shadow-[0_24px_80px_-28px_rgba(14,116,144,0.28)]";
  const dividerClassName = dark ? "border-slate-800" : "border-slate-200/80";
  const mutedClassName = dark ? "text-slate-400" : "text-slate-500";

  // Items that belong to the current mode and are not hidden by the user.
  const modeItems = APP_NAVIGATION_ITEMS.filter((item) => item.modes.includes(appMode));
  const visibleItems = modeItems.filter((item) => item.pinned || !hiddenTabs.includes(item.id));

  // Items the user can toggle (non-pinned items in the current mode).
  const customisableItems = modeItems.filter((item) => !item.pinned);

  function toggleHiddenTab(id: AppNavigationTab) {
    if (hiddenTabs.includes(id)) {
      onSetHiddenTabs(hiddenTabs.filter((t) => t !== id));
    } else {
      onSetHiddenTabs([...hiddenTabs, id]);
    }
  }

  return (
    <aside className={`hidden min-h-0 overflow-hidden rounded-[26px] border xl:flex xl:w-[212px] xl:flex-col ${shellClassName}`}>
      {/* Logo */}
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
                    ? dark
                      ? "bg-slate-600 text-white shadow-sm"
                      : "bg-white text-sky-700 shadow-sm"
                    : dark
                      ? "text-slate-400 hover:text-slate-200"
                      : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {m === "ai-chat" ? "AI Chat" : "AI Code"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Nav items */}
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        {customiseOpen ? (
          /* ── Customise panel ── */
          <div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider opacity-60">Dostosuj zakładki</span>
              <button
                type="button"
                onClick={() => setCustomiseOpen(false)}
                className={`rounded-lg p-1 transition-colors ${dark ? "hover:bg-slate-800" : "hover:bg-slate-100"}`}
                aria-label="Zamknij"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1">
              {customisableItems.map((item) => {
                const Icon = item.icon;
                const isVisible = !hiddenTabs.includes(item.id);
                return (
                  <label
                    key={item.id}
                    className={`flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${
                      dark ? "hover:bg-slate-800" : "hover:bg-sky-50"
                    }`}
                  >
                    <Icon className={`h-4 w-4 flex-shrink-0 ${isVisible ? (dark ? "text-sky-400" : "text-sky-600") : mutedClassName}`} />
                    <span className={`flex-1 truncate font-medium ${isVisible ? "" : mutedClassName}`}>{item.label}</span>
                    <span
                      role="checkbox"
                      aria-checked={isVisible}
                      onClick={() => toggleHiddenTab(item.id)}
                      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none ${
                        isVisible
                          ? "bg-sky-500"
                          : dark
                            ? "bg-slate-600"
                            : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          isVisible ? "translate-x-4" : "translate-x-0"
                        }`}
                      />
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ) : (
          /* ── Normal nav list ── */
          <div className="space-y-1.5">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              const itemClassName = isActive
                ? dark
                  ? "bg-slate-800 text-white"
                  : "bg-gradient-to-r from-sky-700 to-cyan-600 text-white shadow-sm"
                : dark
                  ? "text-slate-300 hover:bg-slate-800/80"
                  : "text-slate-700 hover:bg-sky-50";

              return (
                <div key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    aria-current={isActive ? "page" : undefined}
                    className={`relative flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ease-out ${itemClassName}`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0 transition-transform duration-200" />
                    <span className="truncate">{item.label}</span>
                    {item.id === "notifications" && notificationUnread > 0 && (
                      <span className="ml-auto flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                        {notificationUnread > 99 ? "99+" : notificationUnread}
                      </span>
                    )}
                  </button>
                  {item.id === "jarvis" && (
                    <div className="ml-10 mt-1 flex flex-col gap-1 text-xs">
                      <a href="/downloads/jarvis-windows.exe" download className="text-sky-600 hover:underline">Pobierz Jarvis Windows</a>
                      <a href="/downloads/jarvis-android.apk" download className="text-sky-600 hover:underline">Pobierz Jarvis Android</a>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom section: Customise + Integrations link */}
      <div className={`border-t px-3 py-3 ${dividerClassName}`}>
        {!customiseOpen && (
          <button
            type="button"
            onClick={() => setCustomiseOpen(true)}
            className={`mb-2 flex w-full items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
              dark ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200" : "text-slate-500 hover:bg-sky-50 hover:text-slate-700"
            }`}
          >
            <SlidersHorizontal className="h-4 w-4 flex-shrink-0" />
            <span>Dostosuj zakładki</span>
          </button>
        )}
        <Link
          href="/integrations"
          className={`flex w-full items-center gap-2.5 rounded-2xl px-4 py-2.5 text-sm font-medium transition-colors ${
            dark ? "text-slate-400 hover:bg-slate-800 hover:text-slate-200" : "text-slate-500 hover:bg-sky-50 hover:text-slate-700"
          }`}
        >
          <PlugZap className="h-4 w-4 flex-shrink-0" />
          <span>Integracje →</span>
        </Link>
      </div>
    </aside>
  );
}

