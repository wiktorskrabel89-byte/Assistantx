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
  Sparkles,
  ArrowRight,
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

const FEATURE_GRID = [
  {
    icon: MessageSquare,
    color: "#818cf8",
    glow: "rgba(129,140,248,0.40)",
    bg: "rgba(99,102,241,0.10)",
    key: "multiModel",
  },
  {
    icon: Code2,
    color: "#38bdf8",
    glow: "rgba(56,189,248,0.40)",
    bg: "rgba(56,189,248,0.10)",
    key: "codeReview",
  },
  {
    icon: UploadCloud,
    color: "#a78bfa",
    glow: "rgba(167,139,250,0.40)",
    bg: "rgba(167,139,250,0.10)",
    key: "fileUploads",
  },
  {
    icon: ImageIcon,
    color: "#f472b6",
    glow: "rgba(244,114,182,0.40)",
    bg: "rgba(244,114,182,0.10)",
    key: "imageGen",
  },
  {
    icon: GitBranch,
    color: "#34d399",
    glow: "rgba(52,211,153,0.40)",
    bg: "rgba(52,211,153,0.10)",
    key: "github",
  },
  {
    icon: HardDrive,
    color: "#fbbf24",
    glow: "rgba(251,191,36,0.40)",
    bg: "rgba(251,191,36,0.10)",
    key: "googleDrive",
  },
] as const;

const STATS_KEYS = ["statModels", "statStreaming", "statSync", "statUptime"] as const;

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
    featureSectionTitle: string;
    featureSectionSubtitle: string;
    features: Record<
      (typeof FEATURE_GRID)[number]["key"],
      { title: string; desc: string }
    >;
    statModels: string;
    statStreaming: string;
    statSync: string;
    statUptime: string;
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
    statModels: "10+ AI Models",
    statStreaming: "Real-time streaming",
    statSync: "Cloud sync",
    statUptime: "99.9% uptime",
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
    statModels: "10+ modeli AI",
    statStreaming: "Streaming w czasie rzeczywistym",
    statSync: "Synchronizacja w chmurze",
    statUptime: "Dostępność 99,9%",
    ctaTitle: "Zacznij budować dziś",
    ctaSubtitle:
      "Dołącz do tysięcy deweloperów i zespołów, które już używają AssistantX, aby pracować szybciej.",
    ctaButton: "Zacznij za darmo",
  },
};

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
    <>
      <style jsx global>{`
        @keyframes mesh-drift {
          0%, 100% { transform: translate(0, 0) scale(1); }
          25%      { transform: translate(40px, -60px) scale(1.06); }
          50%      { transform: translate(-30px, 30px) scale(0.96); }
          75%      { transform: translate(60px, 20px) scale(1.04); }
        }
        @keyframes mesh-drift-2 {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33%      { transform: translate(-50px, 40px) scale(1.05); }
          66%      { transform: translate(40px, -30px) scale(0.98); }
        }
        @keyframes float-slow {
          0%, 100% { transform: translateY(0px); }
          50%      { transform: translateY(-12px); }
        }
        @keyframes fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(0.95); opacity: 0.7; }
          50%  { transform: scale(1.15); opacity: 0.3; }
          100% { transform: scale(0.95); opacity: 0.7; }
        }
        @keyframes gradient-shift {
          0%, 100% { background-position: 0% 50%; }
          50%      { background-position: 100% 50%; }
        }
        @keyframes shine {
          0%   { transform: translateX(-100%) skewX(-15deg); }
          100% { transform: translateX(250%) skewX(-15deg); }
        }
        .fade-up { animation: fade-up 0.9s cubic-bezier(0.16, 1, 0.3, 1) backwards; }
        .fade-in { animation: fade-in 1.2s ease-out backwards; }
        .float-slow { animation: float-slow 6s ease-in-out infinite; }
        .gradient-text {
          background: linear-gradient(120deg, #818cf8 0%, #38bdf8 30%, #a78bfa 60%, #f472b6 100%);
          background-size: 200% 200%;
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
          animation: gradient-shift 8s ease-in-out infinite;
        }
        .magnetic-btn {
          position: relative;
          overflow: hidden;
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
                      box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .magnetic-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(120deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%);
          transform: translateX(-100%) skewX(-15deg);
          transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .magnetic-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 12px 40px rgba(99,102,241,0.5), 0 0 60px rgba(99,102,241,0.25);
        }
        .magnetic-btn:hover::before {
          transform: translateX(250%) skewX(-15deg);
        }
        .feature-card {
          position: relative;
          overflow: hidden;
          transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 0.4s ease,
                      box-shadow 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .feature-card::before {
          content: '';
          position: absolute;
          inset: -2px;
          background: linear-gradient(135deg, transparent, transparent, var(--feature-accent, #818cf8));
          opacity: 0;
          transition: opacity 0.5s ease;
          z-index: -1;
          border-radius: inherit;
          filter: blur(20px);
        }
        .feature-card:hover {
          transform: translateY(-4px);
        }
        .feature-card:hover::before {
          opacity: 0.4;
        }
        .nav-link {
          position: relative;
          padding-bottom: 2px;
        }
        .nav-link::after {
          content: '';
          position: absolute;
          left: 0;
          bottom: 0;
          height: 1px;
          width: 0;
          background: linear-gradient(90deg, #818cf8, #38bdf8);
          transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .nav-link:hover::after { width: 100%; }
        .noise-overlay {
          background-image:
            url("data:image/svg+xml;utf8,<svg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)' opacity='0.4'/></svg>");
          opacity: 0.04;
        }
      `}</style>

      <main
        className="relative min-h-screen overflow-hidden"
        style={{
          background: "#06070d",
          color: "#e8eaf0",
          fontFeatureSettings: '"ss01", "cv11"',
        }}
      >
        {/* Animated mesh gradient layer 1 */}
        <div
          className="pointer-events-none absolute -left-[30vw] -top-[40vh] h-[110vh] w-[110vh] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(99,102,241,0.32) 0%, rgba(99,102,241,0.10) 35%, transparent 70%)",
            animation: "mesh-drift 22s ease-in-out infinite",
            filter: "blur(20px)",
          }}
        />
        {/* Animated mesh gradient layer 2 */}
        <div
          className="pointer-events-none absolute -right-[20vw] top-[10vh] h-[90vh] w-[90vh] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(167,139,250,0.28) 0%, rgba(244,114,182,0.10) 40%, transparent 70%)",
            animation: "mesh-drift-2 28s ease-in-out infinite",
            filter: "blur(30px)",
          }}
        />
        {/* Animated mesh gradient layer 3 */}
        <div
          className="pointer-events-none absolute left-[20vw] bottom-[-30vh] h-[80vh] w-[80vh] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(56,189,248,0.22) 0%, rgba(99,102,241,0.08) 45%, transparent 70%)",
            animation: "mesh-drift 30s ease-in-out infinite reverse",
            filter: "blur(25px)",
          }}
        />

        {/* Grid overlay */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
            maskImage: "radial-gradient(ellipse at center, black 40%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at center, black 40%, transparent 80%)",
          }}
        />

        {/* Noise texture */}
        <div className="pointer-events-none absolute inset-0 noise-overlay" />

        <div className="relative mx-auto w-full max-w-7xl px-6 py-6 sm:px-8">
          {/* ── Header ── */}
          <header
            className="fade-in flex flex-wrap items-center justify-between gap-4 rounded-2xl border px-5 py-3 text-sm backdrop-blur-xl"
            style={{
              borderColor: "rgba(255,255,255,0.06)",
              background: "rgba(10,12,20,0.5)",
              color: "rgba(232,234,240,0.72)",
              animationDelay: "0.05s",
            }}
          >
            <Link
              href="/"
              className="flex items-center gap-2 text-base font-bold tracking-tight"
              style={{ color: "#e8eaf0", letterSpacing: "-0.025em" }}
            >
              <span
                className="grid h-7 w-7 place-items-center rounded-lg"
                style={{
                  background:
                    "linear-gradient(135deg, #6366f1 0%, #a78bfa 50%, #f472b6 100%)",
                  boxShadow: "0 4px 18px rgba(99,102,241,0.45)",
                }}
              >
                <Sparkles className="h-4 w-4" style={{ color: "#fff" }} />
              </span>
              <span>AssistantX</span>
            </Link>
            <div className="flex flex-wrap items-center gap-5">
              <PublicLanguageSelector initialLanguage={language} />
              <nav className="flex flex-wrap items-center gap-5 text-sm">
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
                    className="nav-link font-medium transition-colors duration-200 hover:text-white"
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </header>

          {/* ── Hero ── */}
          <section className="relative grid items-center gap-14 py-20 lg:grid-cols-[minmax(0,1fr)_460px] lg:py-28">
            <div className="max-w-2xl">
              {/* Badge */}
              <div
                className="fade-up mb-8 inline-flex items-center gap-2"
                style={{ animationDelay: "0.1s" }}
              >
                <span
                  className="inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.15em]"
                  style={{
                    borderColor: "rgba(129,140,248,0.35)",
                    background:
                      "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(167,139,250,0.10))",
                    color: "#c7d2fe",
                    backdropFilter: "blur(12px)",
                  }}
                >
                  <span
                    className="relative h-1.5 w-1.5 rounded-full"
                    style={{ background: "#818cf8" }}
                  >
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: "#818cf8",
                        animation: "pulse-ring 2.5s ease-in-out infinite",
                      }}
                    />
                  </span>
                  {t.badge}
                </span>
              </div>

              {/* Title */}
              <h1
                className="fade-up text-[clamp(3rem,7vw,5.5rem)] font-extrabold leading-[0.95] tracking-tight"
                style={{
                  letterSpacing: "-0.045em",
                  animationDelay: "0.2s",
                }}
              >
                <span style={{ color: "#f5f6fa" }}>{t.title}</span>
                <br />
                <span className="gradient-text">{t.titleAccent}</span>
              </h1>

              <p
                className="fade-up mt-7 max-w-xl text-lg leading-[1.7]"
                style={{
                  color: "rgba(232,234,240,0.62)",
                  animationDelay: "0.3s",
                }}
              >
                {t.intro}
              </p>

              {/* CTAs */}
              <div
                className="fade-up mt-10 flex flex-wrap items-center gap-3"
                style={{ animationDelay: "0.4s" }}
              >
                <Link
                  href="/auth/login"
                  className="magnetic-btn inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-semibold"
                  style={{
                    background:
                      "linear-gradient(135deg, #6366f1 0%, #4f46e5 60%, #7c3aed 100%)",
                    color: "#fff",
                    boxShadow:
                      "0 8px 28px rgba(99,102,241,0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
                  }}
                >
                  {t.signIn}
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border px-6 text-sm font-semibold transition-all duration-300 hover:border-white/25 hover:bg-white/[0.06]"
                  style={{
                    borderColor: "rgba(255,255,255,0.10)",
                    color: "rgba(232,234,240,0.85)",
                    background: "rgba(255,255,255,0.025)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {t.openPricing}
                </Link>
                <Link
                  href="/roadmap"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border px-6 text-sm font-semibold transition-all duration-300 hover:border-white/25 hover:bg-white/[0.06]"
                  style={{
                    borderColor: "rgba(255,255,255,0.10)",
                    color: "rgba(232,234,240,0.85)",
                    background: "rgba(255,255,255,0.025)",
                    backdropFilter: "blur(8px)",
                  }}
                >
                  {t.openRoadmap}
                </Link>
              </div>

              <p
                className="fade-up mt-6 max-w-xl text-sm leading-6"
                style={{
                  color: "rgba(232,234,240,0.38)",
                  animationDelay: "0.5s",
                }}
              >
                {t.noLogin}
              </p>
            </div>

            {/* Floating glass feature card */}
            <div
              className="fade-up float-slow relative rounded-3xl border p-6 backdrop-blur-2xl"
              style={{
                borderColor: "rgba(129,140,248,0.22)",
                background:
                  "linear-gradient(160deg, rgba(20,22,40,0.65) 0%, rgba(10,12,24,0.85) 100%)",
                boxShadow:
                  "0 24px 64px rgba(0,0,0,0.5), 0 0 80px rgba(99,102,241,0.12), inset 0 1px 0 rgba(255,255,255,0.08)",
                animationDelay: "0.5s",
              }}
            >
              {/* Card glow */}
              <div
                className="pointer-events-none absolute -inset-px rounded-3xl"
                style={{
                  background:
                    "linear-gradient(135deg, rgba(99,102,241,0.35), transparent 40%, transparent 60%, rgba(244,114,182,0.25))",
                  mask: "linear-gradient(black, black) content-box, linear-gradient(black, black)",
                  WebkitMask:
                    "linear-gradient(black, black) content-box, linear-gradient(black, black)",
                  maskComposite: "exclude",
                  WebkitMaskComposite: "xor",
                  padding: "1px",
                  opacity: 0.5,
                }}
              />

              {/* Card header */}
              <div
                className="mb-5 flex items-center justify-between border-b pb-4"
                style={{ borderColor: "rgba(255,255,255,0.06)" }}
              >
                <div>
                  <div
                    className="text-sm font-semibold"
                    style={{ color: "#f5f6fa" }}
                  >
                    AssistantX Workspace
                  </div>
                  <div
                    className="mt-1 text-[11px] uppercase tracking-widest"
                    style={{ color: "rgba(232,234,240,0.35)" }}
                  >
                    {t.socialProofTitle}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="relative h-2 w-2 rounded-full" style={{ background: "#22c55e" }}>
                    <span
                      className="absolute inset-0 rounded-full"
                      style={{
                        background: "#22c55e",
                        animation: "pulse-ring 2s ease-in-out infinite",
                      }}
                    />
                  </span>
                  <span className="text-xs font-medium" style={{ color: "#22c55e" }}>
                    Live
                  </span>
                </div>
              </div>

              {/* Feature bullets */}
              <ul className="space-y-2.5">
                {t.bullets.map((item: string, i: number) => {
                  const Icon = BULLET_ICONS[i] ?? CheckCircle2;
                  const accentColors = ["#818cf8", "#38bdf8", "#a78bfa", "#34d399"];
                  const bgColors = [
                    "rgba(99,102,241,0.14)",
                    "rgba(56,189,248,0.14)",
                    "rgba(167,139,250,0.14)",
                    "rgba(52,211,153,0.14)",
                  ];
                  const color = accentColors[i] ?? "#818cf8";
                  const bg = bgColors[i] ?? "rgba(99,102,241,0.14)";
                  return (
                    <li
                      key={item}
                      className="group flex items-start gap-3 rounded-xl border px-4 py-3 transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04]"
                      style={{
                        borderColor: "rgba(255,255,255,0.05)",
                        background: "rgba(255,255,255,0.02)",
                      }}
                    >
                      <div
                        className="mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110"
                        style={{ background: bg, boxShadow: `0 0 24px ${bg}` }}
                      >
                        <Icon className="h-4 w-4" style={{ color }} />
                      </div>
                      <span
                        className="text-sm leading-6"
                        style={{ color: "rgba(232,234,240,0.82)" }}
                      >
                        {item}
                      </span>
                    </li>
                  );
                })}
              </ul>

              {/* Tech stack */}
              <p
                className="mt-5 border-t pt-4 text-[11px] uppercase tracking-[0.12em]"
                style={{
                  borderColor: "rgba(255,255,255,0.06)",
                  color: "rgba(232,234,240,0.32)",
                }}
              >
                {t.socialProofSubtitle}
              </p>
            </div>
          </section>

          {/* ── Stats bar ── */}
          <div
            className="fade-up relative my-6 overflow-hidden rounded-2xl border px-6 py-5 backdrop-blur-xl"
            style={{
              borderColor: "rgba(129,140,248,0.18)",
              background:
                "linear-gradient(90deg, rgba(99,102,241,0.10), rgba(56,189,248,0.08), rgba(167,139,250,0.10))",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.06)",
              animationDelay: "0.6s",
            }}
          >
            <div className="relative flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium">
              {STATS_KEYS.map((key, idx) => {
                const colors = ["#818cf8", "#38bdf8", "#a78bfa", "#34d399"];
                const color = colors[idx];
                return (
                  <span key={key} className="flex items-center gap-2.5">
                    {idx > 0 && (
                      <span
                        className="hidden h-3 w-px sm:inline-block"
                        style={{ background: "rgba(255,255,255,0.12)" }}
                      />
                    )}
                    <span
                      className="relative h-1.5 w-1.5 rounded-full"
                      style={{ background: color, boxShadow: `0 0 8px ${color}` }}
                    >
                      <span
                        className="absolute inset-0 rounded-full"
                        style={{
                          background: color,
                          animation: `pulse-ring 2.5s ease-in-out infinite`,
                          animationDelay: `${idx * 0.4}s`,
                        }}
                      />
                    </span>
                    <span style={{ color: "rgba(232,234,240,0.82)" }}>
                      {t[key as keyof typeof t]}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* ── Features Grid ── */}
          <section className="py-24">
            <div className="mb-14 text-center">
              <div
                className="fade-up mb-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em]"
                style={{
                  borderColor: "rgba(129,140,248,0.30)",
                  background: "rgba(99,102,241,0.08)",
                  color: "#c7d2fe",
                }}
              >
                <Sparkles className="h-3 w-3" />
                Features
              </div>
              <h2
                className="fade-up text-4xl font-bold tracking-tight sm:text-5xl"
                style={{ letterSpacing: "-0.035em", color: "#f5f6fa", animationDelay: "0.1s" }}
              >
                {t.featureSectionTitle}
              </h2>
              <p
                className="fade-up mx-auto mt-4 max-w-xl text-base leading-7"
                style={{ color: "rgba(232,234,240,0.55)", animationDelay: "0.2s" }}
              >
                {t.featureSectionSubtitle}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURE_GRID.map(({ icon: Icon, color, glow, bg, key }, idx) => {
                const feature = t.features[key];
                return (
                  <div
                    key={key}
                    className="feature-card fade-up group relative overflow-hidden rounded-2xl border p-6 backdrop-blur-xl"
                    style={{
                      borderColor: "rgba(255,255,255,0.06)",
                      background: "rgba(15,17,28,0.55)",
                      boxShadow: "0 6px 24px rgba(0,0,0,0.4)",
                      animationDelay: `${0.25 + idx * 0.08}s`,
                      ["--feature-accent" as string]: color,
                    } as React.CSSProperties}
                  >
                    {/* Hover glow */}
                    <div
                      className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      style={{
                        background: `radial-gradient(circle, ${glow} 0%, transparent 70%)`,
                      }}
                    />

                    {/* Icon */}
                    <div
                      className="mb-5 grid h-12 w-12 place-items-center rounded-xl transition-all duration-500 group-hover:scale-110 group-hover:rotate-6"
                      style={{
                        background: bg,
                        boxShadow: `0 0 32px ${bg}, inset 0 1px 0 ${color}40`,
                        border: `1px solid ${color}30`,
                      }}
                    >
                      <Icon className="h-5 w-5" style={{ color }} />
                    </div>

                    {/* Text */}
                    <h3
                      className="text-base font-semibold tracking-tight"
                      style={{ color: "#f5f6fa", letterSpacing: "-0.015em" }}
                    >
                      {feature.title}
                    </h3>
                    <p
                      className="mt-2 text-sm leading-6"
                      style={{ color: "rgba(232,234,240,0.58)" }}
                    >
                      {feature.desc}
                    </p>

                    {/* Bottom shine line */}
                    <div
                      className="pointer-events-none absolute inset-x-6 bottom-0 h-px opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                      style={{
                        background: `linear-gradient(90deg, transparent, ${color}, transparent)`,
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </section>

          {/* ── Bottom CTA ── */}
          <section className="mb-16">
            <div
              className="relative overflow-hidden rounded-3xl border px-8 py-16 text-center backdrop-blur-2xl"
              style={{
                borderColor: "rgba(129,140,248,0.22)",
                background:
                  "linear-gradient(135deg, rgba(99,102,241,0.14) 0%, rgba(56,189,248,0.08) 50%, rgba(167,139,250,0.14) 100%)",
                boxShadow:
                  "0 12px 48px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06)",
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

              <div className="relative">
                <h2
                  className="text-4xl font-extrabold tracking-tight sm:text-5xl"
                  style={{ letterSpacing: "-0.035em" }}
                >
                  <span className="gradient-text">{t.ctaTitle}</span>
                </h2>
                <p
                  className="mx-auto mt-5 max-w-lg text-base leading-7"
                  style={{ color: "rgba(232,234,240,0.62)" }}
                >
                  {t.ctaSubtitle}
                </p>
                <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
                  <Link
                    href="/auth/login"
                    className="magnetic-btn inline-flex min-h-13 items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold"
                    style={{
                      background:
                        "linear-gradient(135deg, #6366f1 0%, #4f46e5 60%, #7c3aed 100%)",
                      color: "#fff",
                      boxShadow:
                        "0 8px 28px rgba(99,102,241,0.5), inset 0 1px 0 rgba(255,255,255,0.18)",
                    }}
                  >
                    {t.ctaButton}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex min-h-13 items-center justify-center rounded-xl border px-8 py-3.5 text-sm font-semibold transition-all duration-300 hover:border-white/25 hover:bg-white/[0.06]"
                    style={{
                      borderColor: "rgba(255,255,255,0.12)",
                      color: "rgba(232,234,240,0.82)",
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
          className="relative mx-auto max-w-7xl space-y-2 border-t px-6 py-8 text-sm sm:px-8"
          style={{
            borderColor: "rgba(255,255,255,0.06)",
            color: "rgba(232,234,240,0.42)",
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              &copy; {new Date().getFullYear()} AssistantX. {t.footerRights}
            </div>
            <div
              className="text-xs"
              style={{ color: "rgba(232,234,240,0.28)" }}
            >
              Acrux.pl Sp. z o.o., ul. Sobczaka 1, Poznań · NIP: 7792506166
            </div>
          </div>
        </footer>

        <DeferredPublicChatWidget />
      </main>
    </>
  );
}
