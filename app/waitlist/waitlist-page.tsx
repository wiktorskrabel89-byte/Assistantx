"use client";

import Link from "next/link";
import { useState } from "react";
import type { PublicUILanguage } from "@/app/lib/ui-language";
import { WAITLIST_COPY } from "./copy";
import { LanguageToggle } from "./language-toggle";
import {
  ComparisonSection,
  HeroSection,
  PillarsSection,
  ProblemSection,
  SolutionSection,
} from "./sections-intro";
import { EconomicsSection, EngineSection } from "./sections-engine";
import { BeyondSection, FinalCtaSection, NetworkSection } from "./sections-outro";

export default function WaitlistPage({ initialLanguage }: { initialLanguage: PublicUILanguage }) {
  const [language] = useState<PublicUILanguage>(initialLanguage);
  const copy = WAITLIST_COPY[language];

  return (
    <main className="relative min-h-screen overflow-x-hidden" style={{ background: "#0a0a0a", color: "#f5f5f0" }}>
      <style>{`
        @keyframes pulse-glow {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.35; }
        }
        @keyframes bounce-down {
          0%, 100% { transform: translateY(0); opacity: 0.6; }
          50% { transform: translateY(6px); opacity: 1; }
        }
        @keyframes terminal-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>

      {/* Subtle grid overlay */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0"
        style={{
          backgroundImage:
            "linear-gradient(rgba(215,250,138,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(215,250,138,.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <div className="relative mx-auto w-full max-w-6xl px-5">
        {/* ── Header ── */}
        <header className="flex items-center justify-between gap-4 border-b py-5 text-sm" style={{ borderColor: "rgba(255,255,255,0.08)" }}>
          <Link href="/" className="text-base font-bold tracking-tight text-white" style={{ letterSpacing: "-0.02em" }}>
            Assistant<span style={{ color: "#d7fa8a" }}>X</span>
          </Link>
          <LanguageToggle language={language} />
        </header>

        <HeroSection copy={copy.hero} formCopy={copy.form} language={language} />
      </div>

      <ProblemSection copy={copy.problem} />
      <SolutionSection copy={copy.solution} />
      <PillarsSection copy={copy.pillars} />
      <ComparisonSection copy={copy.comparison} />
      <EngineSection copy={copy.engine} />
      <EconomicsSection copy={copy.economics} />
      <BeyondSection copy={copy.beyond} />
      <NetworkSection copy={copy.network} />
      <FinalCtaSection copy={copy.finalCta} formCopy={copy.form} language={language} />

      {/* ── Footer ── */}
      <footer
        className="relative mx-auto w-full max-w-6xl space-y-3 border-t px-5 py-8 text-sm"
        style={{ borderColor: "rgba(255,255,255,0.08)", color: "rgba(245,245,240,0.4)" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            &copy; {new Date().getFullYear()} AssistantX. {copy.footer.rights}
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/" className="transition-colors duration-150 hover:text-white">
              {copy.footer.backHome}
            </Link>
            <Link href="/privacy" className="transition-colors duration-150 hover:text-white">
              {copy.footer.privacy}
            </Link>
            <Link href="/terms" className="transition-colors duration-150 hover:text-white">
              {copy.footer.terms}
            </Link>
          </div>
        </div>
        <div className="text-xs" style={{ color: "rgba(245,245,240,0.25)" }}>
          Acrux.pl Sp. z o.o., ul. Sobczaka 1, Poznań. NIP: 7792506166.
        </div>
      </footer>
    </main>
  );
}
