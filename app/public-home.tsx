"use client";

import Link from "next/link";
import { useState } from "react";
import { PublicLanguageSelector } from "./components/PublicLanguageSelector";
import {
  detectLanguageFromAcceptLanguage,
  normalizePublicLanguage,
  type PublicUILanguage,
  UI_LANGUAGE_COOKIE_NAME,
} from "@/app/lib/ui-language";
import { DeferredPublicChatWidget } from "./components/DeferredPublicChatWidget";

const COPY: Record<PublicUILanguage, {
  badge: string;
  privacy: string;
  terms: string;
  support: string;
  pricing: string;
  roadmap: string;
  title: string;
  intro: string;
  bullets: string[];
  noLogin: string;
  signIn: string;
  reviewPrivacy: string;
  openPricing: string;
  openRoadmap: string;
  socialProofTitle: string;
  socialProofSubtitle: string;
  footerRights: string;
}> = {
  en: {
    badge: "AI workspace for chat, code, files, and integrations",
    privacy: "Privacy Policy",
    terms: "Terms of Service",
    support: "Support",
    pricing: "Pricing",
    roadmap: "Roadmap",
    title: "AssistantX",
    intro: "AssistantX is an advanced AI workspace for chat, code, file uploads, image generation, and cloud-synced projects.",
    bullets: [
      "Multi-model AI chat (GPT, Claude, Gemini, and more)",
      "Code review, file uploads, and image generation",
      "GitHub & Google Drive integration",
      "Supabase-backed authentication and cloud sync",
    ],
    noLogin: "No login is required to view this page. To use the workspace, sign in or create an account.",
    signIn: "Sign In",
    reviewPrivacy: "Review Privacy Policy",
    openPricing: "See Pricing",
    openRoadmap: "View Roadmap",
    socialProofTitle: "Built with trusted developer technologies",
    socialProofSubtitle: "Supabase • GitHub • Google • OpenRouter • Next.js • FastAPI",
    footerRights: "All rights reserved.",
  },
  pl: {
    badge: "Workspace AI do czatu, kodu, plików i integracji",
    privacy: "Polityka prywatności",
    terms: "Regulamin",
    support: "Wsparcie",
    pricing: "Cennik",
    roadmap: "Roadmapa",
    title: "AssistantX",
    intro: "AssistantX to zaawansowany workspace AI do czatu, kodu, uploadu plików, generowania obrazów i synchronizacji projektów w chmurze.",
    bullets: [
      "Czat AI z wieloma modelami (GPT, Claude, Gemini i inne)",
      "Code review, upload plików i generowanie obrazów",
      "Integracje z GitHub i Google Drive",
      "Autoryzacja Supabase i synchronizacja w chmurze",
    ],
    noLogin: "Nie musisz się logować, aby zobaczyć tę stronę. Aby korzystać z workspace, zaloguj się lub załóż konto.",
    signIn: "Zaloguj się",
    reviewPrivacy: "Zobacz politykę prywatności",
    openPricing: "Zobacz cennik",
    openRoadmap: "Zobacz roadmapę",
    socialProofTitle: "Zbudowane na zaufanych technologiach deweloperskich",
    socialProofSubtitle: "Supabase • GitHub • Google • OpenRouter • Next.js • FastAPI",
    footerRights: "Wszelkie prawa zastrzeżone.",
  },
};

export default function PublicHome() {
  const [language] = useState<PublicUILanguage>(() => {
    if (typeof document === "undefined") return "en";
    const cookieValue = document.cookie
      .split(";")
      .map((entry) => entry.trim())
      .find((entry) => entry.startsWith(`${UI_LANGUAGE_COOKIE_NAME}=`))
      ?.split("=")[1];
    if (cookieValue) return normalizePublicLanguage(cookieValue);
    if (typeof navigator !== "undefined") {
      return detectLanguageFromAcceptLanguage(navigator.language);
    }
    return "en";
  });
  const t = COPY[language];

  return (
    <main className="min-h-screen bg-white px-5 py-5 text-slate-950">
      <div className="mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-6xl flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4 text-sm text-slate-600">
          <Link href="/" className="text-base font-semibold tracking-tight text-slate-950">
            AssistantX
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <PublicLanguageSelector initialLanguage={language} />
            <nav className="flex flex-wrap items-center gap-4">
              <Link href="/pricing" className="font-medium hover:text-slate-950">{t.pricing}</Link>
              <Link href="/roadmap" className="font-medium hover:text-slate-950">{t.roadmap}</Link>
              <Link href="/support" className="font-medium hover:text-slate-950">{t.support}</Link>
              <Link href="/privacy" className="font-medium hover:text-slate-950">{t.privacy}</Link>
              <Link href="/terms" className="font-medium hover:text-slate-950">{t.terms}</Link>
            </nav>
          </div>
        </header>

        <section className="grid flex-1 items-center gap-10 py-14 lg:grid-cols-[minmax(0,1fr)_430px] lg:py-20">
          <div className="max-w-2xl">
            <p className="mb-4 text-sm font-medium text-slate-500">{t.badge}</p>
            <h1 className="text-5xl font-semibold tracking-tight text-slate-950 sm:text-6xl">
              {t.title}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
              {t.intro}
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/auth/login" className="inline-flex min-h-11 items-center justify-center rounded-lg bg-slate-950 px-5 text-sm font-semibold text-white transition hover:bg-slate-800">
                {t.signIn}
              </Link>
              <Link href="/pricing" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-5 text-sm font-semibold text-slate-800 transition hover:border-slate-950">
                {t.openPricing}
              </Link>
              <Link href="/roadmap" className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 px-5 text-sm font-semibold text-slate-800 transition hover:border-slate-950">
                {t.openRoadmap}
              </Link>
            </div>
            <p className="mt-5 max-w-xl text-sm leading-6 text-slate-500">
              {t.noLogin}
            </p>
          </div>

          <div className="border border-slate-200 bg-slate-50 p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <div className="text-sm font-semibold text-slate-950">Workspace</div>
                <div className="text-xs text-slate-500">{t.socialProofTitle}</div>
              </div>
              <div className="h-2 w-2 rounded-full bg-emerald-500" />
            </div>
            <ul className="grid gap-3">
              {t.bullets.map((item) => (
                <li key={item} className="border border-slate-200 bg-white px-4 py-3 text-sm leading-6 text-slate-700">
                  {item}
                </li>
              ))}
            </ul>
            <p className="mt-4 border-t border-slate-200 pt-3 text-xs leading-5 text-slate-500">
              {t.socialProofSubtitle}
            </p>
          </div>
        </section>
      </div>
      <footer className="mx-auto mt-4 max-w-6xl space-y-2 border-t border-slate-200 pt-4 text-sm text-slate-500">
        <div>&copy; {new Date().getFullYear()} AssistantX. {t.footerRights}</div>
        <div className="text-xs text-slate-600">
          Acrux.pl Sp. z o.o., ul. Sobczaka 1, Poznań. NIP: 7792506166.
        </div>
      </footer>
      <DeferredPublicChatWidget />
    </main>
  );
}
