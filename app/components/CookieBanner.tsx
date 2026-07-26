"use client";

import { useEffect, useState } from "react";

const COOKIE_NAME = "assistantx-cookie-consent";
// Values: 'all' | 'necessary' — anything else = undecided.

function readConsent(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.split(";").map((c) => c.trim()).find((c) => c.startsWith(`${COOKIE_NAME}=`));
  return match ? decodeURIComponent(match.split("=")[1] || "") : null;
}

function writeConsent(value: "all" | "necessary") {
  const oneYear = 60 * 60 * 24 * 365;
  document.cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${oneYear}; samesite=lax`;
  window.dispatchEvent(new CustomEvent("cookie-consent-changed", { detail: value }));
}

type Copy = {
  title: string;
  body: string;
  reject: string;
  accept: string;
  privacy: string;
};

const COPY: Record<"en" | "pl", Copy> = {
  en: {
    title: "We use cookies",
    body: "We use strictly necessary cookies to sign you in and remember basic preferences. We&apos;d also like to set analytics cookies to understand how you use the site — you can opt out anytime.",
    reject: "Necessary only",
    accept: "Accept all",
    privacy: "Privacy Policy",
  },
  pl: {
    title: "Używamy plików cookie",
    body: "Używamy niezbędnych plików cookie żeby Cię zalogować i zapamiętać preferencje. Chcielibyśmy też ustawić cookies analityczne, żeby zrozumieć jak korzystasz ze strony — możesz się wypisać w każdej chwili.",
    reject: "Tylko niezbędne",
    accept: "Akceptuję wszystkie",
    privacy: "Polityka prywatności",
  },
};

export function CookieBanner({ lang = "en" }: { lang?: "en" | "pl" }) {
  const [hidden, setHidden] = useState(true);
  const copy = COPY[lang] ?? COPY.en;

  useEffect(() => {
    const v = readConsent();
    setHidden(Boolean(v));
  }, []);

  if (hidden) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label={copy.title}
      className="fixed bottom-4 left-1/2 z-50 w-[min(560px,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-white/[0.1] bg-[#0a0a12]/95 p-5 shadow-2xl shadow-purple-500/10 backdrop-blur-xl"
      style={{ animation: "cookie-in 0.4s cubic-bezier(0.22,1,0.36,1) both" }}
    >
      <p className="text-sm font-semibold tracking-tight text-white">🍪 {copy.title}</p>
      <p className="mt-2 text-xs leading-6 text-white/60"
         dangerouslySetInnerHTML={{ __html: copy.body }}
      />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <a
          href="/privacy"
          className="text-[11px] text-violet-300 hover:text-violet-200 underline decoration-violet-400/50 underline-offset-2"
        >
          {copy.privacy}
        </a>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              writeConsent("necessary");
              setHidden(true);
            }}
            className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-white/70 hover:text-white hover:border-white/20 transition"
          >
            {copy.reject}
          </button>
          <button
            type="button"
            onClick={() => {
              writeConsent("all");
              setHidden(true);
            }}
            className="group relative rounded-full px-4 py-1.5 text-xs font-semibold text-white overflow-hidden transition-transform hover:scale-[1.03]"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600" />
            <span className="relative z-10">{copy.accept}</span>
          </button>
        </div>
      </div>
      <style>{`
        @keyframes cookie-in {
          from { opacity: 0; transform: translate(-50%, 12px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}

export const COOKIE_CONSENT_NAME = COOKIE_NAME;
