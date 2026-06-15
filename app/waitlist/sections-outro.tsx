"use client";

import { Copy, Eye, Gamepad2, GraduationCap, Mail, Monitor, Share2, Smartphone } from "lucide-react";
import type { PublicUILanguage } from "@/app/lib/ui-language";
import type { WaitlistCopy, BeyondCard } from "./copy";
import { Reveal } from "./hooks";
import { Card, GlowOrb, SectionHeading, Terminal } from "./ui";
import { WaitlistForm } from "./waitlist-form";

const LIME = "#d7fa8a";

const BEYOND_ICONS: Record<BeyondCard["key"], typeof Smartphone> = {
  mobile: Smartphone,
  operator: Monitor,
  macro: Copy,
  academy: GraduationCap,
  worlds: Gamepad2,
  vision: Eye,
  twin: Copy,
};

export function BeyondSection({ copy }: { copy: WaitlistCopy["beyond"] }) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
      <Reveal>
        <SectionHeading kicker={copy.kicker} title={copy.title} subtitle={copy.subtitle} center />
      </Reveal>
      <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {copy.cards.map((card, i) => {
          const Icon = BEYOND_ICONS[card.key];
          return (
            <Reveal key={card.key} delay={(i % 3) * 0.08} className={card.terminal ? "lg:col-span-2" : ""}>
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
                {card.terminal ? <Terminal lines={card.terminal} className="mt-4" /> : null}
              </Card>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}

export function NetworkSection({ copy }: { copy: WaitlistCopy["network"] }) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:py-20">
      <Reveal>
        <Card className="relative overflow-hidden text-center sm:text-left">
          <GlowOrb className="-right-20 -top-20 h-64 w-64 opacity-30" />
          <div className="relative flex flex-col items-center gap-6 sm:flex-row sm:items-start">
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl"
              style={{ background: "rgba(215,250,138,0.08)" }}
            >
              <Share2 className="h-6 w-6" style={{ color: LIME }} />
            </div>
            <div>
              <SectionHeading kicker={copy.kicker} title={copy.title} />
              <p className="mt-3 max-w-2xl text-sm leading-7" style={{ color: "rgba(245,245,240,0.55)" }}>
                {copy.body}
              </p>
              <span
                className="mt-4 inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs"
                style={{ borderColor: "rgba(255,255,255,0.14)", color: "rgba(255,255,255,0.55)" }}
              >
                {copy.badge}
              </span>
            </div>
          </div>
        </Card>
      </Reveal>
    </section>
  );
}

export function FinalCtaSection({
  copy,
  formCopy,
  language,
}: {
  copy: WaitlistCopy["finalCta"];
  formCopy: WaitlistCopy["form"];
  language: PublicUILanguage;
}) {
  return (
    <section className="relative mx-auto w-full max-w-6xl px-5 py-16 sm:py-24">
      <GlowOrb className="left-1/2 top-0 h-[420px] w-[420px] -translate-x-1/2 opacity-50" />
      <Reveal className="relative flex flex-col items-center text-center">
        <span
          className="inline-flex items-center gap-2 rounded-full border px-3 py-1 font-mono text-xs font-semibold uppercase tracking-[0.2em]"
          style={{ borderColor: "rgba(215,250,138,0.3)", color: LIME, background: "rgba(215,250,138,0.05)" }}
        >
          {copy.kicker}
        </span>
        <h2
          className="mt-5 text-4xl font-extrabold tracking-tight text-white sm:text-5xl"
          style={{ letterSpacing: "-0.03em" }}
        >
          {copy.title}
        </h2>
        <p className="mt-4 max-w-xl text-base leading-7" style={{ color: "rgba(245,245,240,0.6)" }}>
          {copy.subtitle}
        </p>

        <WaitlistForm copy={formCopy} language={language} className="mt-8 w-full max-w-md" />

        <span
          className="mt-10 rounded-full border px-4 py-1.5 font-mono text-xs tracking-wider"
          style={{ borderColor: "rgba(215,250,138,0.25)", color: LIME }}
        >
          {copy.badge}
        </span>

        <a
          href={`mailto:${copy.contactEmail}`}
          className="mt-6 inline-flex items-center gap-2 text-sm transition-colors duration-150 hover:text-white"
          style={{ color: "rgba(245,245,240,0.5)" }}
        >
          <Mail className="h-4 w-4" />
          {copy.contactLabel} {copy.contactEmail}
        </a>
      </Reveal>
    </section>
  );
}
