"use client";

import {
  Bell,
  BookOpen,
  BrainCircuit,
  CodeXml,
  Database,
  FolderKanban,
  LibraryBig,
  MessageSquareText,
  Search,
  Settings2,
  Share2,
  SquareTerminal,
  type LucideIcon,
} from "lucide-react";

export type AppNavigationTab =
  | "chat"
  | "sandbox"
  | "learning"
  | "projects"
  | "codebase"
  | "scripts"
  | "prompt-library"
  | "knowledge-export"
  | "settings"
  | "notifications"
  | "ai-learning";

type AppNavigationColumnProps = {
  dark: boolean;
  activeTab: AppNavigationTab;
  onSelectTab: (tab: AppNavigationTab) => void;
};

type AppNavigationItem = {
  id: AppNavigationTab;
  label: string;
  icon: LucideIcon;
};

const APP_NAVIGATION_ITEMS: AppNavigationItem[] = [
  { id: "chat", label: "Chat", icon: MessageSquareText },
  { id: "sandbox", label: "Sandbox", icon: SquareTerminal },
  { id: "learning", label: "Learning", icon: BookOpen },
  { id: "projects", label: "Projekty", icon: FolderKanban },
  { id: "codebase", label: "Codebase", icon: Database },
  { id: "scripts", label: "Scripts", icon: CodeXml },
  { id: "prompt-library", label: "Prompt Library", icon: LibraryBig },
  { id: "knowledge-export", label: "Knowledge Export", icon: Share2 },
  { id: "settings", label: "Ustawienia", icon: Settings2 },
  { id: "notifications", label: "Powiadomienia", icon: Bell },
  { id: "ai-learning", label: "AI Learning", icon: BrainCircuit },
];

export function AppNavigationColumn({ dark, activeTab, onSelectTab }: AppNavigationColumnProps) {
  const shellClassName = dark
    ? "border-slate-800 bg-slate-900 text-slate-100"
    : "border-slate-200 bg-white/95 text-slate-900 shadow-sm shadow-slate-200/70";
  const searchClassName = dark
    ? "border-slate-700 bg-slate-950 text-slate-100 placeholder-slate-500"
    : "border-slate-200 bg-white text-slate-900 placeholder-slate-400";

  return (
    <aside className={`hidden min-h-0 overflow-hidden rounded-[26px] border xl:flex xl:w-[212px] xl:flex-col ${shellClassName}`}>
      <div className="border-b border-slate-200 px-4 py-4 dark:border-slate-800">
        <div className="rounded-2xl bg-gradient-to-br from-slate-700 to-slate-500 px-4 py-4 text-white shadow-sm">
          <div className="text-[1.35rem] font-bold tracking-tight">Moje AI</div>
          <div className="mt-1 text-xs text-slate-200/90">Powered by AI</div>
        </div>

        <div className="relative mt-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            placeholder="Szukaj..."
            className={`w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm ${searchClassName}`}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1.5">
          {APP_NAVIGATION_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            const itemClassName = isActive
              ? dark
                ? "bg-slate-800 text-white"
                : "bg-slate-700 text-white shadow-sm"
              : dark
                ? "text-slate-300 hover:bg-slate-800/80"
                : "text-slate-700 hover:bg-slate-100";

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                aria-current={isActive ? "page" : undefined}
                className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition-all duration-200 ease-out ${itemClassName}`}
              >
                <Icon className="h-4 w-4 flex-shrink-0 transition-transform duration-200" />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

