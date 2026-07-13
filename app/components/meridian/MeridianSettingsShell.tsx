"use client";

/**
 * MeridianSettingsShell — Supabase-style 10-section settings panel.
 *
 * Wraps the existing SettingsTab content in section "Ogólne" so nothing
 * breaks during the migration, while adding the 9 new Meridian-spec
 * sections (Modele / Integracje / Automatyzacja / Audio / Prywatność /
 * Zaawansowane / Agenci / Aktualizacje / O programie).
 *
 * Section list is driven from the Rail icon set in MeridianRail so the
 * left rail and the section panes stay in sync without duplicate config.
 *
 * Step 8 places real content per section; for this skeleton stage every
 * non-implemented section renders an ox-panel placeholder. The Zaawansowane
 * pane is fully wired today (DevToolsToggle + DiagnosticsCard).
 */

import { useState, type ReactNode } from "react";
import {
  Bot,
  Code,
  Cpu,
  Info,
  Link as LinkIcon,
  Lock,
  Mic,
  RefreshCw,
  Settings as SettingsIcon,
  Terminal,
} from "lucide-react";
import { MeridianDevToolsToggle } from "./MeridianDevToolsToggle";
import { MeridianDiagnosticsCard } from "./MeridianDiagnosticsCard";
import { GeneralSection } from "./settings-sections/GeneralSection";
import { AudioSection } from "./settings-sections/AudioSection";
import { ModelsSection } from "./settings-sections/ModelsSection";
import { UpdatesSection } from "./settings-sections/UpdatesSection";
import { AboutSection } from "./settings-sections/AboutSection";

type SettingsSectionId =
  | "general"
  | "models"
  | "integrations"
  | "automation"
  | "audio"
  | "privacy"
  | "advanced"
  | "agents"
  | "updates"
  | "about";

type SettingsSection = {
  id: SettingsSectionId;
  label: string;
  description: string;
  Icon: typeof SettingsIcon;
};

const SECTIONS: SettingsSection[] = [
  { id: "general",     label: "Ogólne",       description: "Profil, język, motyw, zachowanie startowe.", Icon: SettingsIcon },
  { id: "models",      label: "Modele",       description: "Router 6 lane: Chat / Coding / Coding Extended / Reasoning / Vision / Supervisor.", Icon: Cpu },
  { id: "integrations", label: "Integracje",  description: "GitHub, Discord, Google Drive, Notion, Supabase, Twitch, MCP — w jednym miejscu.", Icon: LinkIcon },
  { id: "automation",  label: "Automatyzacja", description: "Browser / Terminal / File / App control + poziomy uprawnień (Safe / Smart / Autonomous).", Icon: Terminal },
  { id: "audio",       label: "Audio",        description: "Mikrofon, redukcja szumów, wake-word sensitivity, tryb głosu (Wake / PTT / Always).", Icon: Mic },
  { id: "privacy",     label: "Prywatność",   description: "Historia rozmów, pamięć, eksport i usuwanie danych, bezpieczeństwo.", Icon: Lock },
  { id: "advanced",    label: "Zaawansowane", description: "Tryb dewelopera, diagnostyka, logi, eksperymentalne flagi.", Icon: Code },
  { id: "agents",      label: "Agenci",       description: "Włączanie agentów, limity, uprawnienia, monitoring.", Icon: Bot },
  { id: "updates",     label: "Aktualizacje", description: "Wersja, changelog, sprawdzanie aktualizacji, auto-update.", Icon: RefreshCw },
  { id: "about",       label: "O programie",  description: "Wersja, build, sprzęt, zainstalowane modele, licencja.", Icon: Info },
];

export type MeridianSettingsShellProps = {
  /** Original SettingsTab content — rendered inside the "Ogólne" pane so      */
  /** nothing in the current settings flow breaks while the new sections fill. */
  legacyGeneralContent?: ReactNode;
  /** Backend health-ping target. Forwarded to MeridianDiagnosticsCard. */
  apiBase?: string;
};

export function MeridianSettingsShell({
  legacyGeneralContent,
  apiBase,
}: MeridianSettingsShellProps) {
  const [activeId, setActiveId] = useState<SettingsSectionId>("general");
  const active = SECTIONS.find((s) => s.id === activeId) ?? SECTIONS[0];

  return (
    <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
      {/* Sub-nav — supplements the global MeridianRail with section names.    */}
      <nav
        aria-label="Sekcje ustawień"
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
          Ustawienia
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

      {/* Content pane */}
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

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {activeId === "general" ? (
            <>
              <GeneralSection />
              {legacyGeneralContent ? (
                <details
                  style={{
                    padding: "10px 12px",
                    border: "1px solid var(--ox-border)",
                    borderRadius: 6,
                    background: "var(--ox-bg1)",
                  }}
                >
                  <summary
                    style={{
                      color: "var(--ox-text-mid)",
                      fontFamily: "var(--ox-font-mono)",
                      fontSize: 10,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                      cursor: "pointer",
                    }}
                  >
                    {"Legacy ustawienia (do migracji)"}
                  </summary>
                  <div style={{ marginTop: 10 }}>{legacyGeneralContent}</div>
                </details>
              ) : null}
            </>
          ) : activeId === "models" ? (
            <ModelsSection />
          ) : activeId === "audio" ? (
            <AudioSection />
          ) : activeId === "advanced" ? (
            <>
              <MeridianDevToolsToggle />
              <MeridianDiagnosticsCard apiBase={apiBase} />
            </>
          ) : activeId === "updates" ? (
            <UpdatesSection />
          ) : activeId === "about" ? (
            <AboutSection />
          ) : (
            <SectionPlaceholder section={active.label} />
          )}
        </div>
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
      <div style={{ color: "var(--ox-cyan)", fontFamily: "var(--ox-font-mono)", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
        W przygotowaniu
      </div>
      {"Sekcja „"}{section}{"” pojawi się w kolejnym etapie migracji. Zachowane są ustawienia z poprzedniej wersji — przejdź do „Ogólne”, aby je zobaczyć."}
    </div>
  );
}
