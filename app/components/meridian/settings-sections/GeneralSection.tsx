"use client";

/**
 * Settings → Ogólne. Theme + language + notifications + startup behavior.
 * Wires the language picker to the same useMeridianLocale hook the wizard
 * uses, so changing language here is identical to re-running the wizard.
 */

import { Settings as SettingsIcon, RotateCcw } from "lucide-react";
import { SectionCard, SectionField } from "../SectionCard";
import {
  LOCALE_AVAILABILITY,
  LOCALE_LABELS,
  useMeridianLocale,
  type LocaleId,
} from "../useMeridianLocale";
import { getPreference, setPreference } from "../../../lib/memory-v1";
import { useEffect, useState } from "react";

type ThemeId = "dark" | "light" | "oled";

const THEME_OPTIONS: Array<{ id: ThemeId; label: string; status: "active" | "coming-soon" }> = [
  { id: "dark", label: "Dark Obsidian", status: "active" },
  { id: "light", label: "Light", status: "coming-soon" },
  { id: "oled", label: "OLED Black", status: "coming-soon" },
];

const LOCALE_ORDER: LocaleId[] = ["pl", "en", "es", "de"];

const PREF_KEYS = {
  username: "general.username",
  notifications: "general.notifications",
  startup: "general.startupBehavior",
} as const;

type StartupBehavior = "last-tab" | "chat" | "workspace";

export function GeneralSection() {
  const { locale, setLocale, reset } = useMeridianLocale();
  const [username, setUsername] = useState<string>("");
  const [notifications, setNotifications] = useState<boolean>(true);
  const [startup, setStartup] = useState<StartupBehavior>("chat");

  // Hydrate from Memory V1 preferences once on mount. Defer to next frame so
  // we don't read localStorage during render.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const rafId = window.requestAnimationFrame(() => {
      setUsername(String(getPreference<string>(PREF_KEYS.username, "") ?? ""));
      const notif = getPreference<boolean>(PREF_KEYS.notifications, true);
      setNotifications(typeof notif === "boolean" ? notif : true);
      const startupRaw = getPreference<string>(PREF_KEYS.startup, "chat");
      setStartup(
        startupRaw === "chat" || startupRaw === "workspace" || startupRaw === "last-tab"
          ? startupRaw
          : "chat",
      );
    });
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <SectionCard
        Icon={SettingsIcon}
        title="Profil i wygląd"
        description="Nazwa wyświetlana, motyw oraz język interfejsu."
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <SectionField label="Nazwa użytkownika">
            <input
              type="text"
              value={username}
              onChange={(e) => {
                setUsername(e.target.value);
                setPreference(PREF_KEYS.username, e.target.value);
              }}
              placeholder="np. Wiktor"
              style={{
                padding: "8px 10px",
                background: "var(--ox-bg3)",
                border: "1px solid var(--ox-border)",
                borderRadius: 6,
                color: "var(--ox-text-hi)",
                fontFamily: "var(--ox-font-sans)",
                fontSize: 13,
                outline: "none",
              }}
            />
          </SectionField>

          <SectionField label="Motyw">
            <select
              value="dark"
              onChange={() => {
                /* Light + OLED disabled until Phase 1 complete — locked to dark. */
              }}
              style={selectStyle}
            >
              {THEME_OPTIONS.map(({ id, label, status }) => (
                <option key={id} value={id} disabled={status !== "active"}>
                  {label}
                  {status === "coming-soon" ? " · wkrótce" : ""}
                </option>
              ))}
            </select>
          </SectionField>

          <SectionField label="Język interfejsu" hint="Aktywne: Polski, English. Pozostałe wkrótce.">
            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as LocaleId)}
              style={selectStyle}
            >
              {LOCALE_ORDER.map((id) => {
                const disabled = LOCALE_AVAILABILITY[id] !== "active";
                return (
                  <option key={id} value={id} disabled={disabled}>
                    {LOCALE_LABELS[id]}
                    {disabled ? " · wkrótce" : ""}
                  </option>
                );
              })}
            </select>
          </SectionField>

          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button
              type="button"
              onClick={reset}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                background: "transparent",
                border: "1px solid var(--ox-border)",
                borderRadius: 6,
                color: "var(--ox-text-mid)",
                fontFamily: "var(--ox-font-mono)",
                fontSize: 11,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                cursor: "pointer",
              }}
            >
              <RotateCcw className="h-3 w-3" />
              {"Otwórz kreator języka"}
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Powiadomienia i start" description="Co Jarvis robi przy uruchomieniu i jak Cię informuje.">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <label style={toggleRowStyle}>
            <span style={toggleLabelStyle}>Powiadomienia w aplikacji</span>
            <input
              type="checkbox"
              checked={notifications}
              onChange={(e) => {
                setNotifications(e.target.checked);
                setPreference(PREF_KEYS.notifications, e.target.checked);
              }}
            />
          </label>

          <SectionField label="Zachowanie startowe">
            <select
              value={startup}
              onChange={(e) => {
                const next = e.target.value as StartupBehavior;
                setStartup(next);
                setPreference(PREF_KEYS.startup, next);
              }}
              style={selectStyle}
            >
              <option value="chat">Otwórz Czat (domyślnie)</option>
              <option value="workspace">Otwórz Workspace</option>
              <option value="last-tab">Wróć do ostatniej zakładki</option>
            </select>
          </SectionField>
        </div>
      </SectionCard>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  padding: "8px 10px",
  background: "var(--ox-bg3)",
  border: "1px solid var(--ox-border)",
  borderRadius: 6,
  color: "var(--ox-text-hi)",
  fontFamily: "var(--ox-font-sans)",
  fontSize: 13,
  outline: "none",
  cursor: "pointer",
};

const toggleRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid var(--ox-border)",
  background: "var(--ox-bg2)",
  cursor: "pointer",
};

const toggleLabelStyle: React.CSSProperties = {
  color: "var(--ox-text-hi)",
  fontFamily: "var(--ox-font-sans)",
  fontSize: 13,
};
