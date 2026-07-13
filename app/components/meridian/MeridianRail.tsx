"use client";

/**
 * MeridianRail — 48px left icon column for the Meridian shell.
 *
 * Context-dependent: the icon set is driven by the active tab. Czat ships 3
 * shortcuts; Workspace and Ustawienia ship the full sub-section list and rely
 * on overflow scroll if they exceed the visible rail height.
 *
 * The rail is presentation-only; the parent owns which item is active.
 */

import {
  BookOpen,
  Bot,
  Brain,
  CalendarClock,
  Code,
  Cpu,
  FolderKanban,
  FolderOpen,
  Globe,
  Info,
  Link as LinkIcon,
  Lock,
  Map as MapIcon,
  MessageSquare,
  Mic,
  RefreshCw,
  Search,
  Settings,
  Target,
  Terminal,
  Workflow,
  Zap,
} from "lucide-react";
import type { MeridianRailItem, MeridianTab } from "./types";

const CHAT_RAIL: MeridianRailItem[] = [
  { id: "chat",   label: "Czat",   Icon: MessageSquare },
  { id: "files",  label: "Pliki",  Icon: FolderOpen },
  { id: "search", label: "Szukaj", Icon: Search },
];

const WORKSPACE_RAIL: MeridianRailItem[] = [
  { id: "projects",   label: "Projekty",            Icon: FolderKanban },
  { id: "skills",     label: "Umiejętności",        Icon: Zap },
  { id: "memory",     label: "Pamięć",              Icon: Brain },
  { id: "lessons",    label: "Lekcje",              Icon: BookOpen },
  { id: "knowledge",  label: "Wiedza",              Icon: Globe },
  { id: "scheduled",  label: "Zaplanowane zadania", Icon: CalendarClock },
  { id: "workflows",  label: "Workflowy",           Icon: Workflow },
  { id: "blueprints", label: "Blueprinty",          Icon: MapIcon },
  { id: "missions",   label: "Misje",               Icon: Target },
  { id: "search",     label: "Szukaj",              Icon: Search },
];

const SETTINGS_RAIL: MeridianRailItem[] = [
  { id: "general",     label: "Ogólne",       Icon: Settings },
  { id: "models",      label: "Modele",       Icon: Cpu },
  { id: "integrations", label: "Integracje",  Icon: LinkIcon },
  { id: "automation",  label: "Automatyzacja", Icon: Terminal },
  { id: "audio",       label: "Audio",        Icon: Mic },
  { id: "privacy",     label: "Prywatność",   Icon: Lock },
  { id: "advanced",    label: "Zaawansowane", Icon: Code },
  { id: "agents",      label: "Agenci",       Icon: Bot },
  { id: "updates",     label: "Aktualizacje", Icon: RefreshCw },
  { id: "about",       label: "O programie",  Icon: Info },
];

function railFor(tab: MeridianTab): MeridianRailItem[] {
  if (tab === "chat") return CHAT_RAIL;
  if (tab === "workspace") return WORKSPACE_RAIL;
  return SETTINGS_RAIL;
}

export type MeridianRailProps = {
  activeTab: MeridianTab;
  activeItemId: string | null;
  onItemChange: (itemId: string) => void;
};

export function MeridianRail({
  activeTab,
  activeItemId,
  onItemChange,
}: MeridianRailProps) {
  const items = railFor(activeTab);

  return (
    <nav
      aria-label={`Skróty dla zakładki ${activeTab}`}
      className="relative flex shrink-0 flex-col items-center gap-1 py-2"
      style={{
        width: 48,
        background: "var(--ox-bg1)",
        borderRight: "1px solid var(--ox-border)",
        overflowY: "auto",
        scrollbarWidth: "none",
      }}
    >
      {items.map(({ id, label, Icon }) => {
        const isActive = activeItemId === id;
        return (
          <button
            key={id}
            type="button"
            title={label}
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => onItemChange(id)}
            data-ox-anim
            className={`relative flex h-9 w-9 items-center justify-center ${
              isActive ? "ox-glow-cyan" : ""
            }`}
            style={{
              borderRadius: 8,
              background: isActive ? "var(--ox-bg3)" : "transparent",
              color: isActive ? "var(--ox-cyan)" : "var(--ox-text-dim)",
              transition:
                "background var(--ox-duration-base) var(--ox-ease), color var(--ox-duration-base) var(--ox-ease)",
            }}
            onMouseEnter={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "var(--ox-bg2)";
                e.currentTarget.style.color = "var(--ox-text-mid)";
              }
            }}
            onMouseLeave={(e) => {
              if (!isActive) {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--ox-text-dim)";
              }
            }}
          >
            <Icon className="h-4 w-4" />
          </button>
        );
      })}
    </nav>
  );
}
