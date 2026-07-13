"use client";

/**
 * MeridianWorkspaceShell — "Jarvis Brain" tab. 10 sub-sections:
 *   Projekty / Umiejętności / Pamięć / Lekcje / Wiedza / Zaplanowane
 *   zadania / Workflowy / Blueprinty / Misje / Szukaj
 *
 * Skeleton stage: each pane renders an ox-glass placeholder card describing
 * what it will host. The Szukaj pane ships a working input bound to a noop
 * handler so the box is visible and tab-order-correct.
 *
 * Real content is implemented per follow-on milestone (each sub-section is
 * its own non-trivial scope). The shell is forward-compatible: pass a
 * `paneOverrides` map to inject real content for any subset of sections
 * without modifying the shell.
 */

import { useState, type ReactNode } from "react";
import {
  BookOpen,
  Brain,
  CalendarClock,
  FolderKanban,
  Globe,
  Map as MapIcon,
  Search,
  Target,
  Workflow,
  Zap,
} from "lucide-react";
import { MemorySection } from "./workspace-sections/MemorySection";
import { SkillsSection } from "./workspace-sections/SkillsSection";
import { SearchSection } from "./workspace-sections/SearchSection";

type WorkspaceSectionId =
  | "projects"
  | "skills"
  | "memory"
  | "lessons"
  | "knowledge"
  | "scheduled"
  | "workflows"
  | "blueprints"
  | "missions"
  | "search";

type WorkspaceSection = {
  id: WorkspaceSectionId;
  label: string;
  description: string;
  Icon: typeof FolderKanban;
};

const SECTIONS: WorkspaceSection[] = [
  { id: "projects",   label: "Projekty",            description: "Per-projekt: pliki, postęp, zależności, pamięć, lekcje, blueprinty.", Icon: FolderKanban },
  { id: "skills",     label: "Umiejętności",        description: "Confidence score, success rate, usage — Jarvis preferuje wyższe pewności.", Icon: Zap },
  { id: "memory",     label: "Pamięć",              description: "User-specific: preferencje, custom instructions, conversation memory, long-term.", Icon: Brain },
  { id: "lessons",    label: "Lekcje",              description: "Failure → Cause → Fix — historia błędów i ich rozwiązań.", Icon: BookOpen },
  { id: "knowledge",  label: "Wiedza",              description: "General learned information + graf relacji między bytami.", Icon: Globe },
  { id: "scheduled",  label: "Zaplanowane zadania", description: "Cyklika, najbliższy run, włącz/wyłącz, edycja harmonogramu.", Icon: CalendarClock },
  { id: "workflows",  label: "Workflowy",           description: "One-click: Select → Requirements → Execution → Delivery.", Icon: Workflow },
  { id: "blueprints", label: "Blueprinty",          description: "Goal, requirements, features, tech stack, timeline, koszt.", Icon: MapIcon },
  { id: "missions",   label: "Misje",               description: "Long-term cele — progress, milestones, deadlines, knowledge gaps.", Icon: Target },
  { id: "search",     label: "Szukaj",              description: "Global search po wszystkich sekcjach Workspace.", Icon: Search },
];

export type MeridianWorkspaceShellProps = {
  /** Provide real content for any subset of sections. Missing ids fall back to placeholders. */
  paneOverrides?: Partial<Record<WorkspaceSectionId, ReactNode>>;
};

export function MeridianWorkspaceShell({ paneOverrides }: MeridianWorkspaceShellProps = {}) {
  const [activeId, setActiveId] = useState<WorkspaceSectionId>("projects");
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];
  const override = paneOverrides?.[activeId];

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      <nav
        aria-label="Sekcje Workspace"
        style={{
          width: 220,
          flexShrink: 0,
          background: "var(--ox-bg1)",
          borderRight: "1px solid var(--ox-border)",
          overflowY: "auto",
          padding: "12px 8px",
        }}
      >
        <div
          style={{
            color: "var(--ox-text-dim)",
            fontFamily: "var(--ox-font-mono)",
            fontSize: 10,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            padding: "4px 8px 8px",
          }}
        >
          Jarvis Brain
        </div>
        {SECTIONS.map(({ id, label, Icon }) => {
          const isActive = id === activeId;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveId(id)}
              aria-current={isActive ? "page" : undefined}
              data-ox-anim
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 10px",
                margin: "1px 0",
                borderRadius: 6,
                background: isActive ? "var(--ox-bg3)" : "transparent",
                border: "1px solid transparent",
                borderColor: isActive ? "var(--ox-cyan-dim)" : "transparent",
                color: isActive ? "var(--ox-cyan)" : "var(--ox-text-mid)",
                cursor: "pointer",
                fontFamily: "var(--ox-font-sans)",
                fontSize: 13,
                fontWeight: isActive ? 600 : 500,
                textAlign: "left",
                transition:
                  "background var(--ox-duration-base) var(--ox-ease), color var(--ox-duration-base) var(--ox-ease), border-color var(--ox-duration-base) var(--ox-ease)",
              }}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          );
        })}
      </nav>

      <main
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 24px 32px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <header>
          <h2
            style={{
              margin: 0,
              color: "var(--ox-text-hi)",
              fontFamily: "var(--ox-font-sans)",
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: "-0.01em",
            }}
          >
            {active.label}
          </h2>
          <p
            style={{
              margin: "4px 0 0",
              color: "var(--ox-text-mid)",
              fontFamily: "var(--ox-font-sans)",
              fontSize: 13,
              lineHeight: 1.55,
              maxWidth: 640,
            }}
          >
            {active.description}
          </p>
        </header>

        {override ??
          (activeId === "memory" ? (
            <MemorySection />
          ) : activeId === "skills" ? (
            <SkillsSection />
          ) : activeId === "search" ? (
            <SearchSection />
          ) : (
            <SectionPlaceholder section={active.label} />
          ))}
      </main>
    </div>
  );
}

function SectionPlaceholder({ section }: { section: string }) {
  return (
    <div
      className="ox-glass ox-glow-cyan"
      style={{
        padding: "32px 24px",
        borderRadius: 10,
        textAlign: "center",
        color: "var(--ox-text-mid)",
        fontFamily: "var(--ox-font-sans)",
        fontSize: 12.5,
        lineHeight: 1.55,
      }}
    >
      <div
        style={{
          color: "var(--ox-cyan)",
          fontFamily: "var(--ox-font-mono)",
          fontSize: 10,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        W przygotowaniu
      </div>
      {"Sekcja „"}{section}{"” pojawi się po wdrożeniu odpowiedniego modułu — Memory v1, Skill Confidence, Scheduler lub równoważny."}
    </div>
  );
}

// (SearchPane removed — replaced by SearchSection wired to Memory V1 + Skill Confidence.)
