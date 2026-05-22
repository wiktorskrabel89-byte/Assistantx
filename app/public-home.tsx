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
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-cyan-100 px-6 py-10 text-slate-900">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl flex-col justify-center gap-8">
        <div className="rounded-[2rem] border border-blue-200/70 bg-white/90 p-8 shadow-[0_24px_80px_-28px_rgba(37,99,235,0.28)] backdrop-blur">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
            <span className="inline-flex items-center rounded-full border border-blue-200 bg-blue-50 px-3 py-1 font-medium text-blue-700">
              {t.badge}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <PublicLanguageSelector initialLanguage={language} />
              <nav className="flex flex-wrap items-center gap-3">
                <Link href="/privacy" className="font-medium underline decoration-blue-200 underline-offset-4 hover:text-blue-700">
                  {t.privacy}
                </Link>
                <Link href="/terms" className="font-medium underline decoration-blue-200 underline-offset-4 hover:text-blue-700">
                  {t.terms}
                </Link>
                <Link href="/support" className="font-medium underline decoration-blue-200 underline-offset-4 hover:text-blue-700">
                  {t.support}
                </Link>
                <Link href="/pricing" className="font-medium underline decoration-blue-200 underline-offset-4 hover:text-blue-700">
                  {t.pricing}
                </Link>
                <Link href="/roadmap" className="font-medium underline decoration-blue-200 underline-offset-4 hover:text-blue-700">
                  {t.roadmap}
                </Link>
              </nav>
            </div>
          </div>

          <h1 className="mb-4 text-4xl font-bold text-blue-700">{t.title}</h1>
          <p className="mb-4 text-lg text-slate-700">
            <strong>AssistantX</strong> {t.intro}
          </p>
          <ul className="mb-6 list-disc pl-6 text-slate-700">
            {t.bullets.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <p className="mb-6 text-slate-600">
            {t.noLogin}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/auth/login" className="inline-flex rounded-xl bg-blue-600 px-6 py-3 font-medium text-white transition hover:bg-blue-700">
              {t.signIn}
            </Link>
            <Link href="/pricing" className="inline-flex rounded-xl border border-slate-200 px-6 py-3 font-medium text-slate-700 transition hover:border-blue-200 hover:text-blue-700">
              {t.openPricing}
            </Link>
            <Link href="/roadmap" className="inline-flex rounded-xl border border-slate-200 px-6 py-3 font-medium text-slate-700 transition hover:border-blue-200 hover:text-blue-700">
              {t.openRoadmap}
            </Link>
            <Link href="/privacy" className="inline-flex rounded-xl border border-slate-200 px-6 py-3 font-medium text-slate-700 transition hover:border-blue-200 hover:text-blue-700">
              {t.reviewPrivacy}
            </Link>
          </div>

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 px-5 py-4">
            <div className="text-sm font-semibold text-slate-800">{t.socialProofTitle}</div>
            <p className="mt-1 text-sm text-slate-600">{t.socialProofSubtitle}</p>
          </div>
        </div>
      </div>
      <footer className="mt-8 space-y-2 text-center text-sm text-slate-500">
        <div>&copy; {new Date().getFullYear()} AssistantX. {t.footerRights}</div>
        <div className="text-xs text-slate-600">
          Acrux.pl Sp. z o.o., ul. Sobczaka 1, Poznań. NIP: 7792506166.
        </div>
      </footer>
      <DeferredPublicChatWidget />
    </main>
  );
}
