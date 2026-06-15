"use client";

import { Brain, CheckCircle2, ChevronDown, Cpu, Hand } from "lucide-react";
import type { PublicUILanguage } from "@/app/lib/ui-language";
import type { WaitlistCopy } from "./copy";
import { Reveal } from "./hooks";
import { Card, GlowOrb, SectionHeading } from "./ui";
import { WaitlistForm } from "./waitlist-form";

const LIME = "#d7fa8a";

const PILLAR_ICONS = { brain: Brain, hands: Hand, muscles: Cpu } as const;

export function HeroSection({
  copy,
  formCopy,
  language,
}: {
  copy: WaitlistCopy["hero"];
  formCopy: WaitlistCopy["form"];
  language: PublicUILanguage;
}) {
  return (
    <section className="relative flex flex-col items-center px-5 pb-24 pt-16 text-center sm:pt-24">
      <GlowOrb className="-top-32 left-1/2 h-[480px] w-[480px] -translate-x-1/2 opacity-60" />

      <div className="relative mb-8 flex flex-wrap items-center justify-center gap-3">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ borderColor: "rgba(215,250,138,0.35)", color: LIME, background: "rgba(215,250,138,0.06)" }}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: LIME, boxShadow: `0 0 8px ${LIME}`, animation: "pulse-glow 2s ease-in-out infinite" }}
          />
          {copy.kicker}
        </span>
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.6)" }}
        >
          {copy.codename}
        </span>
      </div>

      <h1
        className="relative text-6xl font-extrabold leading-[0.95] tracking-tight text-white sm:text-8xl lg:text-[8.5rem]"
        style={{ letterSpacing: "-0.04em" }}
      >
        {copy.titleMain}
        <span style={{ color: LIME, textShadow: `0 0 50px ${LIME}66` }}>{copy.titleAccent}</span>
      </h1>

      <p className="relative mt-6 max-w-2xl text-xl font-semibold text-white sm:text-2xl">{copy.subtitle}</p>
      <p className="relative mt-4 max-w-xl text-base leading-7" style={{ color: "rgba(245,245,240,0.55)" }}>
        {copy.description}
      </p>

      <WaitlistForm copy={formCopy} language={language} className="relative mt-10 w-full max-w-md" />

      <div
        className="relative mt-16 flex flex-col items-center gap-2 font-mono text-xs uppercase tracking-widest"
        style={{ color: "rgba(255,255,255,0.35)" }}
      >
        {copy.scrollHint}
        <ChevronDown className="h-4 w-4" style={{ animation: "bounce-down 1.8s ease-in-out infinite" }} />
      </div>
    </section>
  );
}

export function ProblemSection({ copy }: { copy: WaitlistCopy["problem"] }) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
      <Reveal>
        <SectionHeading kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} />
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {copy.cards.map((card, i) => (
          <Reveal key={card.title} delay={i * 0.1}>
            <Card accent="#f87171" className="h-full">
              <h3 className="text-lg font-bold text-white">{card.title}</h3>
              <p className="mt-2 text-sm leading-6" style={{ color: "rgba(245,245,240,0.6)" }}>
                {card.body}
              </p>
            </Card>
          </Reveal>
        ))}
      </div>
    </section>
  );
}

export function SolutionSection({ copy }: { copy: WaitlistCopy["solution"] }) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
      <GlowOrb className="-right-32 top-1/2 h-96 w-96 -translate-y-1/2 opacity-40" />
      <Reveal className="relative">
        <SectionHeading kicker={copy.kicker} title={copy.title} center />
        <p
          className="mx-auto mt-5 max-w-2xl text-center text-base leading-7"
          style={{ color: "rgba(245,245,240,0.6)" }}
        >
          {copy.body}
        </p>
        <p
          className="mx-auto mt-6 max-w-xl rounded-xl border px-5 py-3 text-center font-mono text-sm font-semibold"
          style={{ borderColor: "rgba(215,250,138,0.3)", background: "rgba(215,250,138,0.06)", color: LIME }}
        >
          {copy.highlight}
        </p>
      </Reveal>
    </section>
  );
}

export function PillarsSection({ copy }: { copy: WaitlistCopy["pillars"] }) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
      <Reveal>
        <SectionHeading kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} center />
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-3">
        {copy.items.map((item, i) => {
          const Icon = PILLAR_ICONS[item.key];
          return (
            <Reveal key={item.key} delay={i * 0.1}>
              <Card className="h-full text-center">
                <div
                  className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl"
                  style={{ background: "rgba(215,250,138,0.08)" }}
                >
                  <Icon className="h-6 w-6" style={{ color: LIME }} />
                </div>
                <h3 className="text-base font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-sm leading-6" style={{ color: "rgba(245,245,240,0.55)" }}>
                  {item.desc}
                </p>
              </Card>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function ComparisonSection({ copy }: { copy: WaitlistCopy["comparison"] }) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
      <Reveal>
        <SectionHeading kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} center />
      </Reveal>
      <Reveal delay={0.1}>
        <div
          className="mt-10 overflow-hidden rounded-2xl border"
          style={{ borderColor: "rgba(255,255,255,0.08)" }}
        >
          <div className="grid grid-cols-[1.3fr_1fr_1fr] gap-px" style={{ background: "rgba(255,255,255,0.06)" }}>
            <div className="bg-[#0a0a0a] p-3 sm:p-4" />
            <div
              className="bg-[#0a0a0a] p-3 text-center font-mono text-xs font-bold uppercase tracking-wider sm:p-4 sm:text-sm"
              style={{ color: LIME }}
            >
              {copy.assistantxLabel}
            </div>
            <div
              className="bg-[#0a0a0a] p-3 text-center font-mono text-xs font-bold uppercase tracking-wider sm:p-4 sm:text-sm"
              style={{ color: "rgba(255,255,255,0.4)" }}
            >
              {copy.competitorLabel}
            </div>

            {copy.rows.map((row) => (
              <div key={row.label} className="contents">
                <div
                  className="bg-[#0a0a0a] p-3 text-xs font-medium leading-5 text-white/80 sm:p-4 sm:text-sm"
                >
                  {row.label}
                </div>
                <div
                  className="bg-[#0a0a0a] flex flex-col items-center justify-center gap-1 p-3 text-center text-xs leading-5 sm:p-4 sm:text-sm"
                  style={{ color: LIME }}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {row.assistantx}
                </div>
                <div
                  className="bg-[#0a0a0a] p-3 text-center text-xs leading-5 sm:p-4 sm:text-sm"
                  style={{ color: "rgba(255,255,255,0.4)" }}
                >
                  {row.competitor}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Reveal>
    </section>
  );
}
