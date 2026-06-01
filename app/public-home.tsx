"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Zap, GitBranch, Shield, Cloud } from "lucide-react";
import { PublicLanguageSelector } from "./components/PublicLanguageSelector";
import {
  detectLanguageFromAcceptLanguage,
  normalizePublicLanguage,
  type PublicUILanguage,
  UI_LANGUAGE_COOKIE_NAME,
} from "@/app/lib/ui-language";
import { DeferredPublicChatWidget } from "./components/DeferredPublicChatWidget";

const BULLET_ICONS = [Zap, GitBranch, Cloud, Shield];

const COPY: Record<PublicUILanguage, {
  badge: string;
  privacy: string;
  terms: string;
  support: string;
  pricing: string;
  roadmap: string;
  title: string;
  titleAccent: string;
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
    badge: "AI workspace · chat · code · files · integrations",
    privacy: "Privacy",
    terms: "Terms",
    support: "Support",
    pricing: "Pricing",
    roadmap: "Roadmap",
    title: "Your AI",
    titleAccent: "Workspace",
    intro: "AssistantX is an advanced AI workspace for chat, code, file uploads, image generation, and cloud-synced projects.",
    bullets: [
      "Multi-model AI chat — GPT, Claude, Gemini, and more",
      "Code review, file uploads, and image generation",
      "GitHub & Google Drive integration",
      "Supabase-backed authentication and cloud sync",
    ],
    noLogin: "No login required to view this page. Sign in or create an account to use the workspace.",
    signIn: "Sign In",
    reviewPrivacy: "Privacy Policy",
    openPricing: "See Pricing",
    openRoadmap: "View Roadmap",
    socialProofTitle: "Built with trusted developer technologies",
    socialProofSubtitle: "Supabase · GitHub · Google · OpenRouter · Next.js · FastAPI",
    footerRights: "All rights reserved.",
  },
  pl: {
    badge: "Workspace AI · czat · kod · pliki · integracje",
    privacy: "Prywatność",
    terms: "Regulamin",
    support: "Wsparcie",
    pricing: "Cennik",
    roadmap: "Roadmapa",
    title: "Twój",
    titleAccent: "Workspace AI",
    intro: "AssistantX to zaawansowany workspace AI do czatu, kodu, uploadu plików, generowania obrazów i synchronizacji projektów w chmurze.",
    bullets: [
      "Czat AI z wieloma modelami — GPT, Claude, Gemini i inne",
      "Code review, upload plików i generowanie obrazów",
      "Integracje z GitHub i Google Drive",
      "Autoryzacja Supabase i synchronizacja w chmurze",
    ],
    noLogin: "Nie musisz się logować, aby zobaczyć tę stronę. Zaloguj się lub załóż konto, aby korzystać z workspace.",
    signIn: "Zaloguj się",
    reviewPrivacy: "Polityka prywatności",
    openPricing: "Zobacz cennik",
    openRoadmap: "Zobacz roadmapę",
    socialProofTitle: "Zbudowane na zaufanych technologiach deweloperskich",
    socialProofSubtitle: "Supabase · GitHub · Google · OpenRouter · Next.js · FastAPI",
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
    <main
      className="relative min-h-screen overflow-hidden px-5 py-5"
      style={{
        background: "linear-gradient(135deg, #0d0d14 0%, #0f1117 50%, #0a0e1a 100%)",
        color: "#e8eaf0",
      }}
    >
      {/* Subtle grid overlay */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(99,102,241,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      {/* Radial glow top-left */}
      <div
        className="pointer-events-none absolute -left-40 -top-40 h-[600px] w-[600px] rounded-full opacity-20"
        style={{
          background: "radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)",
        }}
      />
      {/* Radial glow bottom-right */}
      <div
        className="pointer-events-none absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full opacity-15"
        style={{
          background: "radial-gradient(circle, rgba(56,189,248,0.25) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-[calc(100vh-8rem)] w-full max-w-6xl flex-col">
        {/* ── Header ── */}
        <header
          className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 text-sm"
          style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(232,234,240,0.6)" }}
        >
          <Link
            href="/"
            className="text-base font-bold tracking-tight"
            style={{ color: "#e8eaf0", letterSpacing: "-0.02em" }}
          >
            AssistantX
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <PublicLanguageSelector initialLanguage={language} />
            <nav className="flex flex-wrap items-center gap-4">
              {[
                { href: "/pricing", label: t.pricing },
                { href: "/roadmap", label: t.roadmap },
                { href: "/support", label: t.support },
                { href: "/privacy", label: t.privacy },
                { href: "/terms", label: t.terms },
              ].map(({ href, label }) => (
                <Link
                  key={href}
                  href={href}
                  className="font-medium transition-colors duration-150 hover:text-white"
                >
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </header>

        {/* ── Hero ── */}
        <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:py-24">
          <div className="max-w-2xl">
            {/* Badge */}
            <div className="mb-6 inline-flex items-center gap-2">
              <span
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest"
                style={{
                  borderColor: "rgba(99,102,241,0.4)",
                  background: "rgba(99,102,241,0.1)",
                  color: "#a5b4fc",
                }}
              >
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: "#6366f1", boxShadow: "0 0 6px #6366f1" }}
                />
                {t.badge}
              </span>
            </div>

            {/* Title */}
            <h1
              className="text-5xl font-extrabold leading-none tracking-tight sm:text-6xl lg:text-7xl"
              style={{ letterSpacing: "-0.04em" }}
            >
              <span style={{ color: "#e8eaf0" }}>{t.title}</span>
              <br />
              <span
                style={{
                  background: "linear-gradient(135deg, #6366f1 0%, #38bdf8 60%, #a78bfa 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {t.titleAccent}
              </span>
            </h1>

            <p
              className="mt-6 max-w-xl text-lg leading-8"
              style={{ color: "rgba(232,234,240,0.65)" }}
            >
              {t.intro}
            </p>

            {/* CTAs */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/auth/login"
                className="inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold transition-all duration-150"
                style={{
                  background: "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                  color: "#fff",
                  boxShadow: "0 0 20px rgba(99,102,241,0.35)",
                }}
              >
                {t.signIn}
              </Link>
              <Link
                href="/pricing"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border px-5 text-sm font-semibold transition-all duration-150 hover:border-white/30"
                style={{
                  borderColor: "rgba(255,255,255,0.12)",
                  color: "rgba(232,234,240,0.8)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                {t.openPricing}
              </Link>
              <Link
                href="/roadmap"
                className="inline-flex min-h-11 items-center justify-center rounded-lg border px-5 text-sm font-semibold transition-all duration-150 hover:border-white/30"
                style={{
                  borderColor: "rgba(255,255,255,0.12)",
                  color: "rgba(232,234,240,0.8)",
                  background: "rgba(255,255,255,0.04)",
                }}
              >
                {t.openRoadmap}
              </Link>
            </div>

            <p className="mt-5 max-w-xl text-sm leading-6" style={{ color: "rgba(232,234,240,0.4)" }}>
              {t.noLogin}
            </p>
          </div>

          {/* Feature card */}
          <div
            className="rounded-2xl border p-5"
            style={{
              borderColor: "rgba(99,102,241,0.2)",
              background: "rgba(255,255,255,0.03)",
              backdropFilter: "blur(12px)",
              boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {/* Card header */}
            <div
              className="mb-5 flex items-center justify-between border-b pb-4"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
            >
              <div>
                <div className="text-sm font-semibold" style={{ color: "#e8eaf0" }}>
                  AssistantX Workspace
                </div>
                <div className="mt-0.5 text-xs" style={{ color: "rgba(232,234,240,0.4)" }}>
                  {t.socialProofTitle}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: "#22c55e", boxShadow: "0 0 6px #22c55e" }}
                />
                <span className="text-xs font-medium" style={{ color: "#22c55e" }}>
                  Live
                </span>
              </div>
            </div>

            {/* Feature bullets */}
            <ul className="space-y-3">
              {t.bullets.map((item, i) => {
                const Icon = BULLET_ICONS[i] ?? CheckCircle2;
                return (
                  <li
                    key={item}
                    className="flex items-start gap-3 rounded-xl border px-4 py-3"
                    style={{
                      borderColor: "rgba(255,255,255,0.06)",
                      background: "rgba(255,255,255,0.03)",
                    }}
                  >
                    <div
                      className="mt-0.5 flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ background: "rgba(99,102,241,0.15)" }}
                    >
                      <Icon className="h-3.5 w-3.5" style={{ color: "#818cf8" }} />
                    </div>
                    <span className="text-sm leading-6" style={{ color: "rgba(232,234,240,0.75)" }}>
                      {item}
                    </span>
                  </li>
                );
              })}
            </ul>

            {/* Tech stack */}
            <p
              className="mt-4 border-t pt-3 text-xs leading-5"
              style={{
                borderColor: "rgba(255,255,255,0.08)",
                color: "rgba(232,234,240,0.35)",
              }}
            >
              {t.socialProofSubtitle}
            </p>
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <footer
        className="relative mx-auto mt-4 max-w-6xl space-y-2 border-t pt-4 text-sm"
        style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(232,234,240,0.4)" }}
      >
        <div>
          &copy; {new Date().getFullYear()} AssistantX. {t.footerRights}
        </div>
        <div className="text-xs" style={{ color: "rgba(232,234,240,0.25)" }}>
          Acrux.pl Sp. z o.o., ul. Sobczaka 1, Poznań. NIP: 7792506166.
        </div>
      </footer>

      <DeferredPublicChatWidget />
    </main>
  );
}
