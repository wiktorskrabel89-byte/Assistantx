"use client";

import { useState } from "react";
import { UI_LANGUAGE_COOKIE_NAME, type PublicUILanguage } from "@/app/lib/ui-language";

// Landing-page-specific EN/PL toggle.  The existing PublicLanguageSelector
// is styled for the light-themed public UI (bg-white/80, slate colors) — it
// looks broken on the dark Meridian landing page, so this is the dark twin.
//
// Behaviour identical to PublicLanguageSelector: writes the ui-language
// cookie (same cookie both places, so switching in one carries to the other)
// and reloads so the server components re-render with the new lang.

const STORAGE_KEY = "assistantx.workspace-state.v3";

function persistUiLanguage(language: PublicUILanguage) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, uiLanguage: language }));
  } catch {
    // ignore — best effort mirror into the app's state store
  }
}

function setLanguageCookie(language: PublicUILanguage) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${UI_LANGUAGE_COOKIE_NAME}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function LandingLanguageToggle({
  initialLanguage,
  ariaLabel = "Switch language",
  className = "",
}: {
  initialLanguage: PublicUILanguage;
  ariaLabel?: string;
  className?: string;
}) {
  const [active, setActive] = useState<PublicUILanguage>(initialLanguage);

  const pick = (lang: PublicUILanguage) => {
    if (lang === active) return;
    setActive(lang);
    setLanguageCookie(lang);
    persistUiLanguage(lang);
    window.location.reload();
  };

  const btn = (lang: PublicUILanguage, label: string, title: string) => {
    const isOn = active === lang;
    return (
      <button
        type="button"
        onClick={() => pick(lang)}
        aria-pressed={isOn}
        title={title}
        className={`rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide transition-colors ${
          isOn
            ? "bg-white/90 text-black"
            : "text-white/50 hover:text-white/90"
        }`}
      >
        {label}
      </button>
    );
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-0.5 rounded-full border border-white/10 bg-white/[0.04] p-0.5 backdrop-blur-md ${className}`}
    >
      {btn("en", "EN", "English")}
      {btn("pl", "PL", "Polski")}
    </div>
  );
}
