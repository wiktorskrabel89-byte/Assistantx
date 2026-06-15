"use client";

import { Box, Clock, Cpu, Globe, RefreshCw, Search, Sparkles, Terminal as TerminalIcon, Users } from "lucide-react";
import type { WaitlistCopy, EngineCard } from "./copy";
import { CountUpStat, Reveal } from "./hooks";
import { Card, SectionHeading, Terminal } from "./ui";

const LIME = "#d7fa8a";

const ENGINE_ICONS: Record<EngineCard["key"], typeof Cpu> = {
  hardware: Cpu,
  browser: Globe,
  sandbox: Box,
  healing: RefreshCw,
  discovery: Search,
  team: Users,
  adaptive: Sparkles,
  evolution: Sparkles,
  pattern: TerminalIcon,
  decay: Clock,
};

function EngineCardBody({ card }: { card: EngineCard }) {
  if (card.stat) {
    return (
      <div className="mt-4">
        <div className="text-4xl font-extrabold tabular-nums" style={{ color: LIME }}>
          <CountUpStat value={card.stat.value} suffix={card.stat.suffix} />
        </div>
        <div className="mt-1 text-xs uppercase tracking-wider" style={{ color: "rgba(255,255,255,0.4)" }}>
          {card.stat.label}
        </div>
      </div>
    );
  }

  if (card.steps) {
    return (
      <ol className="mt-4 space-y-2">
        {card.steps.map((step, i) => (
          <li key={step} className="flex items-center gap-2.5 text-sm" style={{ color: "rgba(245,245,240,0.7)" }}>
            <span
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full font-mono text-[10px] font-bold"
              style={{ background: "rgba(215,250,138,0.12)", color: LIME }}
            >
              {i + 1}
            </span>
            {step}
          </li>
        ))}
      </ol>
    );
  }

  if (card.table) {
    return (
      <div className="mt-4 space-y-1.5">
        {card.table.map((row) => (
          <div
            key={row.role}
            className="flex items-baseline justify-between gap-3 rounded-lg border px-3 py-2 text-xs sm:text-sm"
            style={{ borderColor: "rgba(255,255,255,0.06)", background: "rgba(255,255,255,0.02)" }}
          >
            <span className="font-mono font-bold" style={{ color: LIME }}>
              {row.role}
            </span>
            <span className="text-right" style={{ color: "rgba(245,245,240,0.55)" }}>
              {row.desc}
            </span>
          </div>
        ))}
      </div>
    );
  }

  if (card.profiles) {
    return (
      <div className="mt-4 flex flex-wrap gap-1.5">
        {card.profiles.map((profile) => (
          <span
            key={profile}
            className="rounded-full border px-2.5 py-1 font-mono text-[11px]"
            style={{ borderColor: "rgba(215,250,138,0.25)", color: "rgba(215,250,138,0.85)" }}
          >
            {profile}
          </span>
        ))}
      </div>
    );
  }

  if (card.terminal) {
    return <Terminal lines={card.terminal} className="mt-4" />;
  }

  return null;
}

export function EngineSection({ copy }: { copy: WaitlistCopy["engine"] }) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
      <Reveal>
        <SectionHeading kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} center />
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {copy.cards.map((card, i) => {
          const Icon = ENGINE_ICONS[card.key];
          return (
            <Reveal key={card.key} delay={(i % 3) * 0.08}>
              <Card className="h-full">
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-xl"
                  style={{ background: "rgba(215,250,138,0.08)" }}
                >
                  <Icon className="h-5 w-5" style={{ color: LIME }} />
                </div>
                <h3 className="mt-4 text-base font-bold text-white">{card.title}</h3>
                <p className="mt-1.5 text-sm leading-6" style={{ color: "rgba(245,245,240,0.55)" }}>
                  {card.desc}
                </p>
                <EngineCardBody card={card} />
              </Card>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function EconomicsSection({ copy }: { copy: WaitlistCopy["economics"] }) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
      <Reveal>
        <SectionHeading kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} center />
      </Reveal>
      <Reveal delay={0.1}>
        <div className="mx-auto mt-10 grid max-w-3xl items-center gap-6 sm:grid-cols-[1fr_auto_1fr]">
          <div
            className="rounded-2xl border p-8 text-center"
            style={{ borderColor: "rgba(215,250,138,0.3)", background: "rgba(215,250,138,0.06)" }}
          >
            <div className="font-mono text-xs font-bold uppercase tracking-wider" style={{ color: LIME }}>
              {copy.assistantxLabel}
            </div>
            <div className="mt-2 text-5xl font-extrabold text-white">{copy.assistantxPrice}</div>
            <div className="mt-1 text-xs" style={{ color: "rgba(245,245,240,0.45)" }}>
              {copy.note}
            </div>
          </div>

          <div
            className="mx-auto font-mono text-sm font-bold uppercase tracking-widest"
            style={{ color: "rgba(255,255,255,0.3)" }}
          >
            vs
          </div>

          <div
            className="rounded-2xl border p-8 text-center"
            style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)" }}
          >
            <div
              className="font-mono text-xs font-bold uppercase tracking-wider"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              {copy.competitorLabel}
            </div>
            <div className="mt-2 text-5xl font-extrabold" style={{ color: "rgba(255,255,255,0.6)" }}>
              {copy.competitorPrice}
            </div>
            <div className="mt-1 text-xs" style={{ color: "rgba(245,245,240,0.35)" }}>
              {copy.note}
            </div>
          </div>
        </div>

        <p className="mx-auto mt-8 max-w-xl text-center text-lg font-semibold text-white">{copy.tagline}</p>
      </Reveal>
    </section>
  );
}
