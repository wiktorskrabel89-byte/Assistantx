"use client";

import { useState } from "react";
import { UI_LANGUAGE_COOKIE_NAME, type PublicUILanguage } from "@/app/lib/ui-language";

const STORAGE_KEY = "assistantx.workspace-state.v3";

function persistUiLanguage(language: PublicUILanguage) {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const next = { ...parsed, uiLanguage: language };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore local storage parsing issues
  }
}

function setLanguageCookie(language: PublicUILanguage) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${UI_LANGUAGE_COOKIE_NAME}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

export function PublicLanguageSelector({
  initialLanguage,
  withReload = true,
  className = "",
}: {
  initialLanguage: PublicUILanguage;
  withReload?: boolean;
  className?: string;
}) {
  const [activeLanguage, setActiveLanguage] = useState<PublicUILanguage>(initialLanguage);

  const setLanguage = (language: PublicUILanguage) => {
    setActiveLanguage(language);
    setLanguageCookie(language);
    persistUiLanguage(language);
    if (withReload) window.location.reload();
  };

  return (
    <div className={`inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white/80 p-1 ${className}`}>
      <button
        type="button"
        onClick={() => setLanguage("en")}
        aria-pressed={activeLanguage === "en"}
        className={`rounded-full px-2 py-1 text-xs font-medium transition ${activeLanguage === "en" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        title="English"
      >
        🇬🇧 EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage("pl")}
        aria-pressed={activeLanguage === "pl"}
        className={`rounded-full px-2 py-1 text-xs font-medium transition ${activeLanguage === "pl" ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        title="Polski"
      >
        🇵🇱 PL
      </button>
    </div>
  );
}
