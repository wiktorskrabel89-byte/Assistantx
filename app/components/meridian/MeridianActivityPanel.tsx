"use client";

/**
 * MeridianActivityPanel — 360px right column, rendered only when activeTab is
 * "chat". Sections (collapsible) per spec:
 *   1. Aktywność zadań (ListTodo) — current task card + inline agent state
 *   2. Postęp (BarChart2) — step-by-step progress list
 *   3. Replay zadań (History) — completed task replay cards
 *   4. Pliki (FolderOpen) — uploaded files / drag-drop target
 *
 * Skeleton stage: each section renders a labelled `ox-glass` empty state. Real
 * data wires in later milestones (Tasks engine + Files store).
 *
 * Design rule compliance:
 *   - No standalone "Agenci na żywo" section — agent status lives inside the
 *     Task Activity card when a task is active.
 *   - All empty states use ox-glass + ox-glow-cyan (no flat grey boxes).
 */

import { useState, type ComponentType, type CSSProperties } from "react";
import {
  BarChart2,
  FolderOpen,
  History,
  ListTodo,
  ChevronDown,
  ChevronRight,
} from "lucide-react";

/**
 * Icon component shape that matches what lucide-react ships (className + style)
 * without taking a hard dependency on LucideIcon. Widened from a plain
 * className-only type because the section header passes inline color tokens.
 */
type IconLike = ComponentType<{ className?: string; style?: CSSProperties }>;

type Section = {
  id: "tasks" | "progress" | "replay" | "files";
  label: string;
  Icon: IconLike;
  empty: { title: string; hint?: string };
};

const SECTIONS: Section[] = [
  {
    id: "tasks",
    label: "Aktywność zadań",
    Icon: ListTodo,
    empty: { title: "Brak aktywnego zadania", hint: "Wystartuj polecenie, aby zobaczyć kroki agenta." },
  },
  {
    id: "progress",
    label: "Postęp",
    Icon: BarChart2,
    empty: { title: "Brak postępu do raportowania" },
  },
  {
    id: "replay",
    label: "Replay zadań",
    Icon: History,
    empty: { title: "Brak ukończonych zadań do odtworzenia" },
  },
  {
    id: "files",
    label: "Pliki",
    Icon: FolderOpen,
    empty: { title: "Brak załączonych plików", hint: "Przeciągnij i upuść tutaj, aby dołączyć." },
  },
];

type CollapsedMap = Record<Section["id"], boolean>;

export type MeridianActivityPanelProps = {
  /**
   * Persists collapse state across mount when the consumer hoists it. The
   * panel keeps a local default of all-expanded when no controller is given.
   */
  collapsed?: CollapsedMap;
  onCollapsedChange?: (next: CollapsedMap) => void;
};

export function MeridianActivityPanel({
  collapsed,
  onCollapsedChange,
}: MeridianActivityPanelProps) {
  const [localCollapsed, setLocalCollapsed] = useState<CollapsedMap>({
    tasks: false,
    progress: false,
    replay: false,
    files: false,
  });
  const state = collapsed ?? localCollapsed;

  function toggle(id: Section["id"]) {
    const next = { ...state, [id]: !state[id] };
    if (onCollapsedChange) onCollapsedChange(next);
    else setLocalCollapsed(next);
  }

  return (
    <aside
      aria-label="Panel aktywności"
      className="flex shrink-0 flex-col gap-3 overflow-y-auto p-3"
      style={{
        width: 360,
        background: "var(--ox-bg)",
        borderLeft: "1px solid var(--ox-border)",
      }}
    >
      {SECTIONS.map(({ id, label, Icon, empty }) => {
        const isCollapsed = Boolean(state[id]);
        return (
          <section
            key={id}
            aria-label={label}
            data-ox-anim
            style={{
              borderRadius: 8,
              border: "1px solid var(--ox-border)",
              background: "var(--ox-bg2)",
            }}
          >
            <button
              type="button"
              onClick={() => toggle(id)}
              aria-expanded={!isCollapsed}
              className="flex w-full items-center gap-2 px-3 py-2 text-left"
              style={{
                color: "var(--ox-text-mid)",
                fontFamily: "var(--ox-font-sans)",
                fontSize: 12,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                fontWeight: 600,
              }}
            >
              <Icon className="h-3.5 w-3.5" style={{ color: "var(--ox-cyan-dim)" }} />
              <span className="flex-1">{label}</span>
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            {!isCollapsed ? (
              <div className="px-3 pb-3">
                <div
                  className="ox-glass ox-glow-cyan flex flex-col items-center justify-center gap-1 rounded-md px-4 py-6 text-center"
                  data-ox-anim
                >
                  <div
                    style={{
                      color: "var(--ox-text-hi)",
                      fontFamily: "var(--ox-font-sans)",
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {empty.title}
                  </div>
                  {empty.hint ? (
                    <div
                      style={{
                        color: "var(--ox-text-dim)",
                        fontFamily: "var(--ox-font-sans)",
                        fontSize: 11,
                      }}
                    >
                      {empty.hint}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </section>
        );
      })}
    </aside>
  );
}
