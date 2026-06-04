"use client";

import Link from "next/link";
import { useState } from "react";
import {
  CheckCircle2,
  Zap,
  GitBranch,
  Shield,
  Cloud,
  MessageSquare,
  Code2,
  UploadCloud,
  ImageIcon,
  HardDrive,
} from "lucide-react";
import { PublicLanguageSelector } from "./components/PublicLanguageSelector";
import {
  detectLanguageFromAcceptLanguage,
  normalizePublicLanguage,
  type PublicUILanguage,
  UI_LANGUAGE_COOKIE_NAME,
} from "@/app/lib/ui-language";
import { DeferredPublicChatWidget } from "./components/DeferredPublicChatWidget";

const BULLET_ICONS = [Zap, GitBranch, Cloud, Shield];

// ── Feature grid data ──────────────────────────────────────────────────────
const FEATURE_GRID = [
  {
    icon: MessageSquare,
    color: "#6366f1",
    glow: "rgba(99,102,241,0.25)",
    bg: "rgba(99,102,241,0.12)",
    key: "multiModel",
  },
  {
    icon: Code2,
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.25)",
    bg: "rgba(56,189,248,0.12)",
    key: "codeReview",
  },
  {
    icon: UploadCloud,
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.25)",
    bg: "rgba(167,139,250,0.12)",
    key: "fileUploads",
  },
  {
    icon: ImageIcon,
    color: "#f472b6",
    glow: "rgba(244,114,182,0.25)",
    bg: "rgba(244,114,182,0.12)",
    key: "imageGen",
  },
  {
    icon: GitBranch,
    color: "#34d399",
    glow: "rgba(52,211,153,0.25)",
    bg: "rgba(52,211,153,0.12)",
    key: "github",
  },
  {
    icon: HardDrive,
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.25)",
    bg: "rgba(251,191,36,0.12)",
    key: "googleDrive",
  },
] as const;

// ── Stats bar items ────────────────────────────────────────────────────────
const STATS_KEYS = ["statModels", "statStreaming", "statSync", "statUptime"] as const;

// ── COPY ──────────────────────────────────────────────────────────────────
const COPY: Record<
  PublicUILanguage,
  {
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
    // feature grid
    featureSectionTitle: string;
    featureSectionSubtitle: string;
    features: Record<
      (typeof FEATURE_GRID)[number]["key"],
      { title: string; desc: string }
    >;
    // stats bar
    statModels: string;
    statStreaming: string;
    statSync: string;
    statUptime: string;
    // bottom CTA
    ctaTitle: string;
    ctaSubtitle: string;
    ctaButton: string;
  }
> = {
  en: {
    badge: "AI workspace · chat · code · files · integrations",
    privacy: "Privacy",
    terms: "Terms",
    support: "Support",
    pricing: "Pricing",
    roadmap: "Roadmap",
    title: "Your AI",
    titleAccent: "Workspace",
    intro:
      "AssistantX is an advanced AI workspace for chat, code, file uploads, image generation, and cloud-synced projects.",
    bullets: [
      "Multi-model AI chat — GPT, Claude, Gemini, and more",
      "Code review, file uploads, and image generation",
      "GitHub & Google Drive integration",
      "Supabase-backed authentication and cloud sync",
    ],
    noLogin:
      "No login required to view this page. Sign in or create an account to use the workspace.",
    signIn: "Sign In",
    reviewPrivacy: "Privacy Policy",
    openPricing: "See Pricing",
    openRoadmap: "View Roadmap",
    socialProofTitle: "Built with trusted developer technologies",
    socialProofSubtitle:
      "Supabase · GitHub · Google · OpenRouter · Next.js · FastAPI",
    footerRights: "All rights reserved.",
    // feature grid
    featureSectionTitle: "Everything you need to build with AI",
    featureSectionSubtitle:
      "One workspace, six superpowers. From instant chat to deep integrations.",
    features: {
      multiModel: {
        title: "Multi-Model AI Chat",
        desc: "Switch between GPT-4, Claude, Gemini, and 10+ open-source models in a single conversation.",
      },
      codeReview: {
        title: "Code Review",
        desc: "Paste a diff or entire file and get instant inline suggestions, bug reports, and refactors.",
      },
      fileUploads: {
        title: "File Uploads",
        desc: "Attach PDFs, images, CSVs, and source files. The model reads and reasons over your content.",
      },
      imageGen: {
        title: "Image Generation",
        desc: "Generate, edit, and iterate on images with leading diffusion models — right inside chat.",
      },
      github: {
        title: "GitHub Integration",
        desc: "Connect your repos, review PRs, browse issues, and trigger actions without leaving AssistantX.",
      },
      googleDrive: {
        title: "Google Drive",
        desc: "Access and summarise Drive files instantly. Attach documents to any chat with one click.",
      },
    },
    // stats bar
    statModels: "10+ AI Models",
    statStreaming: "Real-time streaming",
    statSync: "Cloud sync",
    statUptime: "99.9% uptime",
    // bottom CTA
    ctaTitle: "Start building today",
    ctaSubtitle:
      "Join thousands of developers and teams already using AssistantX to move faster.",
    ctaButton: "Get Started Free",
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
    intro:
      "AssistantX to zaawansowany workspace AI do czatu, kodu, uploadu plików, generowania obrazów i synchronizacji projektów w chmurze.",
    bullets: [
      "Czat AI z wieloma modelami — GPT, Claude, Gemini i inne",
      "Code review, upload plików i generowanie obrazów",
      "Integracje z GitHub i Google Drive",
      "Autoryzacja Supabase i synchronizacja w chmurze",
    ],
    noLogin:
      "Nie musisz się logować, aby zobaczyć tę stronę. Zaloguj się lub załóż konto, aby korzystać z workspace.",
    signIn: "Zaloguj się",
    reviewPrivacy: "Polityka prywatności",
    openPricing: "Zobacz cennik",
    openRoadmap: "Zobacz roadmapę",
    socialProofTitle: "Zbudowane na zaufanych technologiach deweloperskich",
    socialProofSubtitle:
      "Supabase · GitHub · Google · OpenRouter · Next.js · FastAPI",
    footerRights: "Wszelkie prawa zastrzeżone.",
    // feature grid
    featureSectionTitle: "Wszystko, czego potrzebujesz do pracy z AI",
    featureSectionSubtitle:
      "Jeden workspace, sześć supermocy. Od błyskawicznego czatu po głębokie integracje.",
    features: {
      multiModel: {
        title: "Czat AI z wieloma modelami",
        desc: "Przełączaj się między GPT-4, Claude, Gemini i 10+ modelami open-source w jednej rozmowie.",
      },
      codeReview: {
        title: "Code Review",
        desc: "Wklej diff lub cały plik i otrzymaj natychmiastowe sugestie, raporty błędów i refaktory.",
      },
      fileUploads: {
        title: "Upload plików",
        desc: "Dołącz PDF-y, obrazy, CSV-y i pliki źródłowe. Model czyta i analizuje Twoje treści.",
      },
      imageGen: {
        title: "Generowanie obrazów",
        desc: "Generuj, edytuj i iteruj obrazy z wiodącymi modelami dyfuzyjnymi — bezpośrednio w czacie.",
      },
      github: {
        title: "Integracja z GitHub",
        desc: "Połącz repozytoria, przeglądaj PR-y, issues i wyzwalaj akcje bez wychodzenia z AssistantX.",
      },
      googleDrive: {
        title: "Google Drive",
        desc: "Błyskawicznie przeglądaj i streszczaj pliki z Drive. Dołącz dokumenty do czatu jednym kliknięciem.",
      },
    },
    // stats bar
    statModels: "10+ modeli AI",
    statStreaming: "Streaming w czasie rzeczywistym",
    statSync: "Synchronizacja w chmurze",
    statUptime: "Dostępność 99,9%",
    // bottom CTA
    ctaTitle: "Zacznij budować dziś",
    ctaSubtitle:
      "Dołącz do tysięcy deweloperów i zespołów, które już używają AssistantX, aby pracować szybciej.",
    ctaButton: "Zacznij za darmo",
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────

/** Thin accent bar separating stat items */
function StatDot() {
  return (
    <span
      className="hidden h-3 w-px sm:inline-block"
      style={{ background: "rgba(255,255,255,0.15)" }}
      aria-hidden
    />
  );
}

// ── Component ──────────────────────────────────────────────────────────────
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
        background:
          "linear-gradient(135deg, #0d0d14 0%, #0f1117 50%, #0a0e1a 100%)",
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
          background:
            "radial-gradient(circle, rgba(99,102,241,0.35) 0%, transparent 70%)",
        }}
      />
      {/* Radial glow bottom-right */}
      <div
        className="pointer-events-none absolute -bottom-32 -right-32 h-[500px] w-[500px] rounded-full opacity-15"
        style={{
          background:
            "radial-gradient(circle, rgba(56,189,248,0.25) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl">
        {/* ── Header ── */}
        <header
          className="flex flex-wrap items-center justify-between gap-4 border-b pb-4 text-sm"
          style={{
            borderColor: "rgba(255,255,255,0.08)",
            color: "rgba(232,234,240,0.6)",
          }}
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
        <section className="grid items-center gap-12 py-16 lg:grid-cols-[minmax(0,1fr)_440px] lg:py-24">
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
                  style={{
                    background: "#6366f1",
                    boxShadow: "0 0 6px #6366f1",
                  }}
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
                  background:
                    "linear-gradient(135deg, #6366f1 0%, #38bdf8 60%, #a78bfa 100%)",
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
                  background:
                    "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
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

            <p
              className="mt-5 max-w-xl text-sm leading-6"
              style={{ color: "rgba(232,234,240,0.4)" }}
            >
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
              boxShadow:
                "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {/* Card header */}
            <div
              className="mb-5 flex items-center justify-between border-b pb-4"
              style={{ borderColor: "rgba(255,255,255,0.08)" }}
            >
              <div>
                <div
                  className="text-sm font-semibold"
                  style={{ color: "#e8eaf0" }}
                >
                  AssistantX Workspace
                </div>
                <div
                  className="mt-0.5 text-xs"
                  style={{ color: "rgba(232,234,240,0.4)" }}
                >
                  {t.socialProofTitle}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{
                    background: "#22c55e",
                    boxShadow: "0 0 6px #22c55e",
                  }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: "#22c55e" }}
                >
                  Live
                </span>
              </div>
            </div>

            {/* Feature bullets — improved with colored icons */}
            <ul className="space-y-3">
              {t.bullets.map((item: string, i: number) => {
                const Icon = BULLET_ICONS[i] ?? CheckCircle2;
                // Rotate accent colors per bullet
                const accentColors = ["#818cf8", "#38bdf8", "#a78bfa", "#34d399"];
                const bgColors = [
                  "rgba(99,102,241,0.15)",
                  "rgba(56,189,248,0.15)",
                  "rgba(167,139,250,0.15)",
                  "rgba(52,211,153,0.15)",
                ];
                const color = accentColors[i] ?? "#818cf8";
                const bg = bgColors[i] ?? "rgba(99,102,241,0.15)";
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
                      className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg"
                      style={{ background: bg }}
                    >
                      <Icon className="h-4 w-4" style={{ color }} />
                    </div>
                    <span
                      className="text-sm leading-6"
                      style={{ color: "rgba(232,234,240,0.8)" }}
                    >
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

        {/* ── Animated Stats Bar ── */}
        <div
          className="relative my-4 overflow-hidden rounded-2xl border px-6 py-4"
          style={{
            borderColor: "rgba(99,102,241,0.2)",
            background:
              "linear-gradient(90deg, rgba(99,102,241,0.08) 0%, rgba(56,189,248,0.06) 50%, rgba(167,139,250,0.08) 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          {/* Moving shimmer */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, transparent 0%, rgba(99,102,241,0.07) 40%, rgba(56,189,248,0.07) 60%, transparent 100%)",
              animation: "shimmer 4s ease-in-out infinite",
            }}
          />
          <style>{`
            @keyframes shimmer {
              0%   { transform: translateX(-100%); }
              100% { transform: translateX(100%); }
            }
            @keyframes pulse-dot {
              0%, 100% { opacity: 1; }
              50%       { opacity: 0.4; }
            }
          `}</style>

          <div className="relative flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-medium">
            {STATS_KEYS.map((key, idx) => (
              <span key={key} className="flex items-center gap-2">
                {idx > 0 && <StatDot />}
                <span
                  className="h-1.5 w-1.5 rounded-full"
                  style={{
                    background:
                      idx === 0
                        ? "#6366f1"
                        : idx === 1
                          ? "#38bdf8"
                          : idx === 2
                            ? "#a78bfa"
                            : "#34d399",
                    boxShadow: `0 0 5px ${
                      idx === 0
                        ? "#6366f1"
                        : idx === 1
                          ? "#38bdf8"
                          : idx === 2
                            ? "#a78bfa"
                            : "#34d399"
                    }`,
                    animation: "pulse-dot 2s ease-in-out infinite",
                    animationDelay: `${idx * 0.4}s`,
                  }}
                />
                <span style={{ color: "rgba(232,234,240,0.75)" }}>
                  {t[key]}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* ── Features Grid ── */}
        <section className="py-16">
          {/* Section heading */}
          <div className="mb-10 text-center">
            <h2
              className="text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ letterSpacing: "-0.03em", color: "#e8eaf0" }}
            >
              {t.featureSectionTitle}
            </h2>
            <p
              className="mx-auto mt-3 max-w-xl text-base leading-7"
              style={{ color: "rgba(232,234,240,0.55)" }}
            >
              {t.featureSectionSubtitle}
            </p>
          </div>

          {/* 6-card grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURE_GRID.map(({ icon: Icon, color, glow, bg, key }) => {
              const feature = t.features[key];
              return (
                <div
                  key={key}
                  className="group relative overflow-hidden rounded-2xl border p-5 transition-all duration-300 hover:-translate-y-0.5"
                  style={{
                    borderColor: "rgba(255,255,255,0.07)",
                    background: "rgba(255,255,255,0.025)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
                  }}
                  onMouseEnter={(e: { currentTarget: HTMLDivElement }) => {
                    e.currentTarget.style.borderColor = `${color}55`;
                    e.currentTarget.style.boxShadow =
                      `0 8px 32px rgba(0,0,0,0.35), 0 0 0 1px ${color}22`;
                  }}
                  onMouseLeave={(e: { currentTarget: HTMLDivElement }) => {
                    e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                    e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.3)";
                  }}
                >
                  {/* Glow behind icon */}
                  <div
                    className="absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                    style={{
                      background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
                    }}
                  />

                  {/* Icon */}
                  <div
                    className="mb-4 flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{ background: bg }}
                  >
                    <Icon className="h-5 w-5" style={{ color }} />
                  </div>

                  {/* Text */}
                  <h3
                    className="text-sm font-semibold"
                    style={{ color: "#e8eaf0" }}
                  >
                    {feature.title}
                  </h3>
                  <p
                    className="mt-1.5 text-sm leading-6"
                    style={{ color: "rgba(232,234,240,0.55)" }}
                  >
                    {feature.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="mb-12">
          <div
            className="relative overflow-hidden rounded-2xl border px-8 py-12 text-center"
            style={{
              borderColor: "rgba(99,102,241,0.25)",
              background:
                "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(56,189,248,0.08) 50%, rgba(167,139,250,0.12) 100%)",
              boxShadow:
                "0 8px 40px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
            }}
          >
            {/* Decorative glows */}
            <div
              className="pointer-events-none absolute -left-24 -top-24 h-64 w-64 rounded-full opacity-30"
              style={{
                background:
                  "radial-gradient(circle, rgba(99,102,241,0.4) 0%, transparent 70%)",
              }}
            />
            <div
              className="pointer-events-none absolute -bottom-24 -right-24 h-64 w-64 rounded-full opacity-25"
              style={{
                background:
                  "radial-gradient(circle, rgba(56,189,248,0.35) 0%, transparent 70%)",
              }}
            />

            <div className="relative">
              <h2
                className="text-3xl font-extrabold tracking-tight sm:text-4xl"
                style={{ letterSpacing: "-0.03em" }}
              >
                <span
                  style={{
                    background:
                      "linear-gradient(135deg, #6366f1 0%, #38bdf8 60%, #a78bfa 100%)",
                    WebkitBackgroundClip: "text",
                    WebkitTextFillColor: "transparent",
                    backgroundClip: "text",
                  }}
                >
                  {t.ctaTitle}
                </span>
              </h2>
              <p
                className="mx-auto mt-4 max-w-lg text-base leading-7"
                style={{ color: "rgba(232,234,240,0.6)" }}
              >
                {t.ctaSubtitle}
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link
                  href="/auth/login"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl px-8 text-sm font-semibold transition-all duration-150 hover:scale-105"
                  style={{
                    background:
                      "linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)",
                    color: "#fff",
                    boxShadow:
                      "0 0 24px rgba(99,102,241,0.45), 0 4px 12px rgba(0,0,0,0.3)",
                  }}
                >
                  {t.ctaButton}
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border px-8 text-sm font-semibold transition-all duration-150 hover:border-white/25"
                  style={{
                    borderColor: "rgba(255,255,255,0.14)",
                    color: "rgba(232,234,240,0.8)",
                    background: "rgba(255,255,255,0.04)",
                  }}
                >
                  {t.openPricing}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* ── Footer ── */}
      <footer
        className="relative mx-auto mt-4 max-w-6xl space-y-2 border-t pt-4 text-sm"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          color: "rgba(232,234,240,0.4)",
        }}
      >
        <div>
          &copy; {new Date().getFullYear()} AssistantX. {t.footerRights}
        </div>
        <div
          className="text-xs"
          style={{ color: "rgba(232,234,240,0.25)" }}
        >
          Acrux.pl Sp. z o.o., ul. Sobczaka 1, Poznań. NIP: 7792506166.
        </div>
      </footer>

      <DeferredPublicChatWidget />
    </main>
  );
}
