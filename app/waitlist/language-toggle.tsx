"use client";

import { UI_LANGUAGE_COOKIE_NAME, type PublicUILanguage } from "@/app/lib/ui-language";

function setLanguageCookie(language: PublicUILanguage) {
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${UI_LANGUAGE_COOKIE_NAME}=${language}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
}

/** Dark-themed EN/PL toggle for the cinematic waitlist page. Persists via cookie + reload. */
export function LanguageToggle({
  language,
  className = "",
}: {
  language: PublicUILanguage;
  className?: string;
}) {
  const setLanguage = (next: PublicUILanguage) => {
    if (next === language) return;
    setLanguageCookie(next);
    window.location.reload();
  };

  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border p-1 font-mono text-xs ${className}`}
      style={{ borderColor: "rgba(255,255,255,0.14)", background: "rgba(255,255,255,0.03)" }}
    >
      <button
        type="button"
        onClick={() => setLanguage("en")}
        aria-pressed={language === "en"}
        className="rounded-full px-2.5 py-1 font-semibold transition-colors duration-150"
        style={{
          background: language === "en" ? "#d7fa8a" : "transparent",
          color: language === "en" ? "#0a0a0a" : "rgba(255,255,255,0.55)",
        }}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => setLanguage("pl")}
        aria-pressed={language === "pl"}
        className="rounded-full px-2.5 py-1 font-semibold transition-colors duration-150"
        style={{
          background: language === "pl" ? "#d7fa8a" : "transparent",
          color: language === "pl" ? "#0a0a0a" : "rgba(255,255,255,0.55)",
        }}
      >
        PL
      </button>
    </div>
  );
}
