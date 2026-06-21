"use client";

/**
 * MeridianLanguageWizard — first-run modal that asks the user to pick the UI
 * language. Renders only when useMeridianLocale().hasChosen is false; the
 * caller (workspace-home.tsx) mounts it unconditionally and it gates its own
 * visibility against the hook.
 *
 *   ┌─────────────────────────────────────────┐
 *   │ ◈  Witaj w Jarvisie                     │
 *   │ Wybierz język interfejsu                │
 *   ├─────────────────────────────────────────┤
 *   │ ▢ Polski          Cześć, jestem Jarvis. │  ← active, default selected
 *   │ ▢ English         Hi, I am Jarvis.      │  ← active
 *   │ ▢ Español         wkrótce               │  ← coming-soon, disabled
 *   │ ▢ Deutsch         wkrótce               │  ← coming-soon, disabled
 *   ├─────────────────────────────────────────┤
 *   │                          [ Potwierdź ]  │
 *   └─────────────────────────────────────────┘
 *
 * Single brand-mark (VEGA star) in the corner. No emoji, lucide-only.
 * Backed entirely by the locale hook so the wizard, the Settings → Ogólne
 * picker, and the Ctrl-key flow all share one state.
 */

import { Check, Lock } from "lucide-react";
import { MeridianStarMark } from "./MeridianStarMark";
import {
  LOCALE_AVAILABILITY,
  LOCALE_GREETING,
  LOCALE_LABELS,
  useMeridianLocale,
  type LocaleId,
} from "./useMeridianLocale";

const LOCALE_ORDER: LocaleId[] = ["pl", "en", "es", "de"];

export function MeridianLanguageWizard() {
  const { locale, setLocale, hasChosen, markChosen } = useMeridianLocale();

  if (hasChosen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="meridian-wizard-title"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 10000,
        display: "grid",
        placeItems: "center",
        padding: 24,
        // Full-screen scrim that also covers the TopBar — first-run UX should
        // not let the user click around the rest of the shell until a locale
        // is picked. The Meridian TopBar visibility rule resumes after.
        background: "rgba(5, 6, 8, 0.78)",
        backdropFilter: "blur(8px) saturate(120%)",
        WebkitBackdropFilter: "blur(8px) saturate(120%)",
      }}
    >
      <div
        className="ox-panel ox-glow-cyan"
        style={{
          width: "min(480px, 100%)",
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 20,
        }}
      >
        {/* Header */}
        <header style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "var(--ox-cyan)" }} aria-hidden="true">
            <MeridianStarMark size={28} withHalo haloOpacity={0.3} />
          </span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <h2
              id="meridian-wizard-title"
              style={{
                margin: 0,
                color: "var(--ox-text-hi)",
                fontFamily: "var(--ox-font-ui)",
                fontSize: 18,
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              {"Witaj w Jarvisie"}
            </h2>
            <span
              style={{
                color: "var(--ox-text-mid)",
                fontFamily: "var(--ox-font-sans)",
                fontSize: 12,
              }}
            >
              {"Wybierz język interfejsu · Choose your UI language"}
            </span>
          </div>
        </header>

        {/* Options */}
        <div role="radiogroup" aria-label="Język" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {LOCALE_ORDER.map((id) => {
            const isAvailable = LOCALE_AVAILABILITY[id] === "active";
            const isSelected = locale === id;
            return (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={isSelected}
                disabled={!isAvailable}
                onClick={() => {
                  if (isAvailable) setLocale(id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 14px",
                  borderRadius: 8,
                  border: `1px solid ${isSelected ? "var(--ox-cyan)" : "var(--ox-border)"}`,
                  background: isSelected ? "var(--ox-bg3)" : "transparent",
                  color: isAvailable ? "var(--ox-text-hi)" : "var(--ox-text-dim)",
                  cursor: isAvailable ? "pointer" : "not-allowed",
                  opacity: isAvailable ? 1 : 0.6,
                  textAlign: "left",
                  fontFamily: "var(--ox-font-sans)",
                  fontSize: 13,
                  transition:
                    "border-color var(--ox-duration-base) var(--ox-ease), background var(--ox-duration-base) var(--ox-ease)",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 18,
                    height: 18,
                    borderRadius: "50%",
                    border: `1px solid ${isSelected ? "var(--ox-cyan)" : "var(--ox-border)"}`,
                    background: isSelected ? "var(--ox-cyan)" : "transparent",
                    color: "var(--ox-bg)",
                    flexShrink: 0,
                  }}
                >
                  {isSelected ? <Check className="h-3 w-3" /> : null}
                </span>
                <span style={{ minWidth: 64, fontWeight: 600 }}>{LOCALE_LABELS[id]}</span>
                <span
                  style={{
                    color: "var(--ox-text-mid)",
                    fontFamily: "var(--ox-font-sans)",
                    fontSize: 12,
                    flex: 1,
                  }}
                >
                  {LOCALE_GREETING[id]}
                </span>
                {!isAvailable ? (
                  <span
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "2px 8px",
                      borderRadius: 999,
                      border: "1px solid var(--ox-border)",
                      color: "var(--ox-text-dim)",
                      fontFamily: "var(--ox-font-mono)",
                      fontSize: 9.5,
                      letterSpacing: "0.10em",
                      textTransform: "uppercase",
                    }}
                  >
                    <Lock className="h-2.5 w-2.5" />
                    {"wkrótce"}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <footer style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
          <span
            style={{
              color: "var(--ox-text-dim)",
              fontFamily: "var(--ox-font-mono)",
              fontSize: 10,
              letterSpacing: "0.10em",
              textTransform: "uppercase",
            }}
          >
            {"Zmienisz to później w Ustawieniach · Ogólne"}
          </span>
          <button
            type="button"
            onClick={markChosen}
            style={{
              padding: "8px 16px",
              background: "var(--ox-cyan)",
              border: "1px solid var(--ox-cyan)",
              borderRadius: 6,
              color: "var(--ox-bg)",
              fontFamily: "var(--ox-font-sans)",
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: "0.04em",
              cursor: "pointer",
              boxShadow: "0 0 16px rgba(0,240,255,0.35)",
            }}
          >
            {"Potwierdź"}
          </button>
        </footer>
      </div>
    </div>
  );
}
