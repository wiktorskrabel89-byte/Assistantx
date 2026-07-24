"use client";

import type { PublicUILanguage } from "@/app/lib/ui-language";
import { UI_LANGUAGE_COOKIE_NAME } from "@/app/lib/ui-language";

const OPTIONS: { code: PublicUILanguage; flag: string; short: string }[] = [
  { code: "en", flag: "🇬🇧", short: "EN" },
  { code: "pl", flag: "🇵🇱", short: "PL" },
];

export function LanguageSwitcher({ lang }: { lang: PublicUILanguage }) {
  const setLang = (code: PublicUILanguage) => {
    if (code === lang) return;
    // Persist the choice for a year so future visits skip auto-detection.
    document.cookie = `${UI_LANGUAGE_COOKIE_NAME}=${code}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
    window.location.reload();
  };

  return (
    <div
      role="group"
      aria-label="Language"
      className="fixed top-4 right-4 z-40 inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/40 backdrop-blur px-1 py-1 text-xs shadow-lg"
    >
      {OPTIONS.map((opt) => {
        const active = opt.code === lang;
        return (
          <button
            key={opt.code}
            type="button"
            aria-pressed={active}
            onClick={() => setLang(opt.code)}
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 transition-colors ${
              active
                ? "bg-white/10 text-white"
                : "text-white/50 hover:text-white/90"
            }`}
          >
            <span aria-hidden="true">{opt.flag}</span>
            <span className="font-semibold tracking-wide">{opt.short}</span>
          </button>
        );
      })}
    </div>
  );
}
