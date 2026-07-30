"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { PublicUILanguage } from "@/app/lib/ui-language";
import { getLandingCopy, type FeatureCopy, type LandingCopy } from "@/app/lib/landing-copy";
import { LandingLanguageToggle } from "@/app/components/LandingLanguageToggle";

// ─────────────────────────────────────────────────────────────
// PublicHome — the assistantx.pl landing page.
//
// Structure top-to-bottom:
//   1. Hero           — minimal: nav with logo + language toggle, status
//                       pill, H1 + CTA, scroll hint.  No video, no intro
//                       splash (both were tried and removed).
//   2. FeatureTour    — sticky laptop that opens on scroll, cycles 6 real
//                       UI screenshots, then closes again.
//   3. Comparison     — AssistantX vs AI Chatbots table
//   4. Waitlist       — name + email, GDPR text (not checkbox), live
//                       counter, name-mechanic explanation, honeypot
//   5. Community      — Discord / Docs / Roadmap cards
//   6. Footer
//
// All visible strings live in `app/lib/landing-copy.ts` (EN + PL).  The
// language is chosen server-side from cookie / Accept-Language and passed
// in as a prop; the toggle component writes the cookie + reloads so the
// server-rendered copy re-picks.
// ─────────────────────────────────────────────────────────────

type Props = { language: PublicUILanguage };

const WAITLIST_START_COUNT = 128431; // Kept from the previous landing.
const SMOOTH_SCROLL_TARGET = "waitlist";

export default function PublicHome({ language }: Props) {
  const copy = getLandingCopy(language);

  // Mouse-parallax on the ambient glow orbs — same trick as the old hero,
  // but subtler now that the star of the show is the video.
  const [mousePos, setMousePos] = useState({ x: 0.5, y: 0.5 });
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
  }, []);

  // Modal state for the feature-explainer cards.
  const [openFeature, setOpenFeature] = useState<FeatureCopy | null>(null);
  useEffect(() => {
    if (!openFeature) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpenFeature(null); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [openFeature]);

  // Expandable "why" text on comparison rows.
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  // Fade the scroll-hint arrow once the user actually starts scrolling.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    // overflow-x-clip, NOT -hidden: hidden creates a scroll container that
    // silently breaks position:sticky for every descendant (the laptop tour
    // pins with sticky).  clip clips without the side effect.
    <div className="relative min-h-screen overflow-x-clip bg-[#050508] text-white">

      {/* Ambient background — mouse parallax + dot grid.  Same visual
          language as the old hero so section transitions feel continuous. */}
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0 opacity-30 transition-[background] duration-500"
          style={{
            background: `radial-gradient(ellipse 80% 50% at ${50 + mousePos.x * 10}% ${30 + mousePos.y * 10}%, rgba(120,80,220,0.15), transparent)`,
          }}
        />
        <div
          className="absolute inset-0 opacity-20"
          style={{ background: "radial-gradient(ellipse 60% 40% at 70% 60%, rgba(0,180,255,0.1), transparent)" }}
        />
        <div
          className="absolute inset-0"
          style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px" }}
        />
      </div>

      <SectionReveal>
        <Hero copy={copy} scrolled={scrolled} initialLanguage={language} />
      </SectionReveal>

      <SectionReveal>
        <FeatureTourSection copy={copy} onOpen={setOpenFeature} />
      </SectionReveal>

      <SectionReveal>
        <ComparisonSection copy={copy} expandedRow={expandedRow} onToggleRow={setExpandedRow} />
      </SectionReveal>

      <SectionReveal id={SMOOTH_SCROLL_TARGET}>
        <WaitlistSection copy={copy} />
      </SectionReveal>

      <SectionReveal>
        <CommunitySection copy={copy} />
      </SectionReveal>

      <FeatureModal copy={copy} feature={openFeature} onClose={() => setOpenFeature(null)} />

      <Footer copy={copy} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Section reveal — small scroll-triggered fade-up.  Kept simple so we don't
// pull in a heavier animation lib just for the landing.  Respects
// reduced-motion by starting elements visible from the get-go.
// ─────────────────────────────────────────────────────────────
function SectionReveal({ children, id }: { children: React.ReactNode; id?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  useEffect(() => {
    if (reducedMotion) { setVisible(true); return; }
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); io.disconnect(); }
    }, { rootMargin: "-80px" });
    io.observe(el);
    return () => io.disconnect();
  }, [reducedMotion]);

  return (
    <div
      ref={ref}
      id={id}
      style={{
        opacity: visible || reducedMotion ? 1 : 0,
        transform: visible || reducedMotion ? "translateY(0)" : "translateY(30px)",
        transition: "opacity 0.7s ease, transform 0.7s ease",
      }}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Hero — minimal: nav + H1 + single CTA + scroll hint.  Background is
// the root-level ambient gradient (see PublicHome), so this section is
// intentionally transparent and just lays out the copy.
// ─────────────────────────────────────────────────────────────
function Hero({
  copy,
  scrolled,
  initialLanguage,
}: {
  copy: LandingCopy;
  scrolled: boolean;
  initialLanguage: PublicUILanguage;
}) {
  return (
    <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 pt-24">
      {/* Nav row — logo left, language toggle right. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-6 py-5 sm:px-10">
        <div className="flex items-center gap-3">
          <span className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 via-purple-600 to-blue-600 shadow-lg shadow-purple-500/25">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jarvis-logo.svg" alt={copy.hero.logoAlt} className="h-6 w-6" />
          </span>
          <span className="text-sm font-semibold tracking-wide text-white/80">AssistantX</span>
        </div>
        <LandingLanguageToggle
          initialLanguage={initialLanguage}
          ariaLabel={copy.nav.langToggleAria}
        />
      </div>

      {/* Hero copy on top of the video/scrim. */}
      <div className="relative z-10 mx-auto max-w-3xl text-center">
        {/* Status pill — small signal above the H1: "waitlist open".
            Cheap to read, buys the reader a reason to keep going. */}
        <div className="mb-8 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.03] px-3.5 py-1.5 text-[11px] font-medium text-white/70 backdrop-blur-sm">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400/80 opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
          </span>
          <span className="tracking-wide">{copy.hero.statusPill}</span>
        </div>

        <h1 className="text-5xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl md:text-7xl lg:text-8xl">
          <span className="block bg-gradient-to-r from-white via-white to-white/70 bg-clip-text text-transparent">
            {copy.hero.headlineLead}
          </span>
          <span className="mt-2 block bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">
            {copy.hero.headlineAccent}
          </span>
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-white/60 sm:text-lg">
          {copy.hero.subtitle}
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <a
            href={`#${SMOOTH_SCROLL_TARGET}`}
            className="group relative inline-flex items-center overflow-hidden rounded-full px-9 py-4 text-sm font-semibold transition-transform hover:scale-105 active:scale-95"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600" />
            <span className="absolute inset-0 bg-gradient-to-r from-violet-500 to-blue-500 opacity-0 transition-opacity group-hover:opacity-100" />
            <span className="absolute inset-0 shadow-[0_0_40px_rgba(120,80,220,0.4)]" />
            <span className="relative z-10 flex items-center gap-2">
              {copy.hero.ctaJoin}
              <svg className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </span>
          </a>
          <span className="text-xs text-white/35">{copy.hero.ctaHint}</span>
        </div>
      </div>

      {/* Scroll hint — subtle, fades out once the user starts scrolling.
          NOT a scroll-jacking anchor; just a visual cue there's more. */}
      <a
        href={`#${SMOOTH_SCROLL_TARGET}`}
        aria-label={copy.hero.scrollHint}
        className={`absolute bottom-8 left-1/2 z-10 -translate-x-1/2 flex flex-col items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/40 transition-opacity duration-500 ${scrolled ? "opacity-0" : "opacity-100"}`}
      >
        <span>{copy.hero.scrollHint}</span>
        <span className="flex h-8 w-5 items-start justify-center rounded-full border border-white/25 p-1">
          <span className="h-2 w-1 animate-bounce rounded-full bg-white/50" />
        </span>
      </a>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// FeatureTour — cinematic MULTI-STAGE scroll narrative.
//
// The section is 6× viewport tall.  Inside sits a sticky container that
// stays pinned while the user scrolls through 6 stages — one per feature.
// Each stage:
//   1. Swaps the laptop's on-screen mockup (chat/code, memory, desktop,
//      reasoning, agents, voice) with a cross-fade.
//   2. Highlights the matching callout (cyan border + glow + scale up)
//      and dims the other five.
//   3. Only the active-stage arrow is bright; the rest fade to ~12%.
//   4. Progress dots at the bottom light up like a stepper.
// The whole chassis has a small sine-wobble on rotateY so the laptop
// never sits static.
//
// Reduced-motion → no wobble, no fade transitions on screens (still
// visually stages correctly, just snaps).  Everything is respectful of
// scroll — the sticky-then-release pattern means users retain scroll
// control and the tour ends the moment they scroll past.
// ─────────────────────────────────────────────────────────────

const TOUR_FEATURE_IDS = ["coding", "memory", "desktop", "reasoning", "multiagent", "voice"] as const;
type TourFeatureId = (typeof TOUR_FEATURE_IDS)[number];
const TOUR_LEFT_IDS = new Set<TourFeatureId>(["coding", "memory", "desktop"]);
const TOUR_STAGE_COUNT = TOUR_FEATURE_IDS.length; // 6
// Fraction of the section's scroll room spent on the lid-opening act; the
// rest is split evenly across the six UI stages.  Shared by the scroll
// handler and the click-to-stage math so they can't drift apart.
// No dead "hold" frames at either end: the laptop is folded at the very
// start, opens, cycles the stages, and folds back on the way out.
const TOUR_SHUT_HOLD = 0;
const TOUR_OPEN_END = 0.2;
const TOUR_CLOSE_START = 0.86;
const TOUR_SHUT_END = 1;

// SVG viewBox for the arrow-overlay canvas.  Matches the CSS grid: 1200
// wide (left column 300 + laptop 600 + right column 300), 500 tall (about
// laptop height incl. padding).  Everything below uses %-of-viewBox so
// arrows track the layout at any resolution.
const TOUR_VB = { w: 1200, h: 500 } as const;

type ArrowSpec = {
  id: string;
  // Callout anchor — edge of the callout that meets the laptop (inner edge).
  fromX: number; fromY: number;
  // Screen region anchor — center of the highlighted mockup region.
  toX: number; toY: number;
};

const TOUR_ARROWS: ArrowSpec[] = [
  // Left callouts (fromX = right edge of left column) → left half of screen.
  { id: "coding",     fromX: 300, fromY: 80,  toX: 550, toY: 200 }, // → chat/code area
  { id: "memory",     fromX: 300, fromY: 240, toX: 470, toY: 230 }, // → left rail (memory nav)
  { id: "desktop",    fromX: 300, fromY: 400, toX: 560, toY: 380 }, // → footer status bar
  // Right callouts (fromX = left edge of right column) → right half of screen.
  { id: "reasoning",  fromX: 900, fromY: 80,  toX: 640, toY: 155 }, // → thinking indicator top bar
  { id: "multiagent", fromX: 900, fromY: 240, toX: 730, toY: 260 }, // → task activity panel
  { id: "voice",      fromX: 900, fromY: 400, toX: 650, toY: 400 }, // → voice indicator
];

function FeatureTourSection({
  copy,
  onOpen,
}: {
  copy: LandingCopy;
  onOpen: (f: FeatureCopy) => void;
}) {
  const items = TOUR_FEATURE_IDS
    .map((id) => copy.features.items.find((it) => it.id === id))
    .filter(Boolean) as FeatureCopy[];

  const sectionRef = useRef<HTMLDivElement | null>(null);
  const chassisRef = useRef<HTMLDivElement | null>(null);
  const lidRef = useRef<HTMLDivElement | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const baseRef = useRef<HTMLDivElement | null>(null);
  const lidBackRef = useRef<HTMLDivElement | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [stage, setStage] = useState(0);
  const [opened, setOpened] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  // Click-nav for the arrow controls under the laptop: smooth-scrolls the
  // page to the middle of stage k's scroll slice.  The scroll handler then
  // drives the laptop/stage state exactly as if the user scrolled by hand —
  // no separate animation path, no scroll-jacking (user-initiated only).
  const goToStage = (k: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const clamped = Math.max(0, Math.min(TOUR_STAGE_COUNT - 1, k));
    const vh = window.innerHeight || 800;
    const scrollable = Math.max(1, section.offsetHeight - vh);
    const sectionTop = section.getBoundingClientRect().top + window.scrollY;
    // Land in the middle of stage k's slice of the *stage* range (beat 3),
    // not of the whole section — otherwise clicks drift into the open/close
    // beats and the laptop is mid-fold when you arrive.
    const p =
      TOUR_OPEN_END +
      ((clamped + 0.5) / TOUR_STAGE_COUNT) * (TOUR_CLOSE_START - TOUR_OPEN_END);
    window.scrollTo({ top: sectionTop + p * scrollable, behavior: "smooth" });
  };

  // Scroll choreography, in five beats:
  //   0 → SHUT_HOLD          laptop sits FULLY shut on the desk (held, so
  //                          the reader registers it before anything moves)
  //   SHUT_HOLD → OPEN_END   lid swings up 90°, view sweeps from top-down to
  //                          eye level, screen powers on with a flash
  //   OPEN_END → CLOSE_START six UI screenshots cross-fade (laptop dead
  //                          still + zero rotation = sharpest text)
  //   CLOSE_START → SHUT_END lid folds back down, screen powers off
  //   SHUT_END → 1           laptop sits FULLY shut again (held)
  // Reduced-motion skips straight to the open pose and only cycles stages.
  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const smooth = (t: number) => t * t * (3 - 2 * t); // smoothstep

    // Writes one coherent pose.  `open` is 0 (fully shut) → 1 (fully open);
    // everything else is derived from it, so the opening and closing beats
    // can share the exact same geometry and never drift apart.
    const pose = (open: number, screenOn: number, flashAmt: number) => {
      const lid = lidRef.current;
      const chassis = chassisRef.current;
      const screen = screenRef.current;
      const keys = keysRef.current;
      const flash = flashRef.current;
      const base = baseRef.current;
      const lidBack = lidBackRef.current;
      // Fold stops at -74°, not -90°: at a true right angle BOTH lid faces
      // end up backface-culled and the laptop disappears from the frame.
      // -74° still reads as "nearly shut" and always stays visible.
      if (lid) lid.style.transform = `rotateX(${(-74 + 74 * open).toFixed(2)}deg)`;
      // The lid's aluminum back is only visible while the laptop is mostly
      // folded.  We drive it explicitly instead of trusting
      // `backface-visibility`, which some compositors ignore inside nested
      // preserve-3d subtrees — it was bleeding the logo through the screen.
      if (lidBack) lidBack.style.opacity = (1 - Math.min(1, open / 0.55)).toFixed(3);
      if (chassis) {
        // Folded: 0.86 scale at 30° top-down.  Open: full size, dead flat,
        // facing the reader (zero rotation keeps the screenshots sharp).
        chassis.style.transform =
          `scale(${(0.86 + 0.18 * open).toFixed(3)}) rotateX(${(30 - 30 * open).toFixed(2)}deg)`;
      }
      if (screen) screen.style.opacity = screenOn.toFixed(3);
      if (keys) keys.style.opacity = (0.12 + screenOn * 0.55).toFixed(3);
      if (flash) flash.style.opacity = flashAmt.toFixed(3);
      // The keyboard deck must be INVISIBLE while shut — otherwise it pokes
      // out below the folded lid and the laptop never reads as closed.
      // It fades in over the first third of the opening travel.
      if (base) base.style.opacity = Math.max(0, Math.min(1, (open - 0.06) / 0.3)).toFixed(3);
    };

    const update = () => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const scrollable = Math.max(1, rect.height - vh);
      const scrolled = Math.max(0, -rect.top);
      const p = Math.max(0, Math.min(0.9999, scrolled / scrollable));

      if (reducedMotion) {
        pose(1, 1, 0);
        const ns = Math.min(TOUR_STAGE_COUNT - 1, Math.floor(p * TOUR_STAGE_COUNT));
        setOpened(true);
        setStage((prev) => (prev === ns ? prev : ns));
        return;
      }

      if (p < TOUR_SHUT_HOLD) {
        // ── Beat 1: held fully shut ──
        pose(0, 0, 0);
        setOpened(false);
        setStage((prev) => (prev === 0 ? prev : 0));
      } else if (p < TOUR_OPEN_END) {
        // ── Beat 2: opening ──
        const t = smooth((p - TOUR_SHUT_HOLD) / (TOUR_OPEN_END - TOUR_SHUT_HOLD));
        // Screen wakes at 60% open, fully lit at 92%.
        const on = Math.max(0, Math.min(1, (t - 0.6) / 0.32));
        // Power-on flash: bright burst the instant the panel lights.
        const flashAmt = on > 0 && on < 0.45 ? ((0.45 - on) / 0.45) * 0.6 : 0;
        pose(t, on, flashAmt);
        setOpened(false);
        setStage((prev) => (prev === 0 ? prev : 0));
      } else if (p < TOUR_CLOSE_START) {
        // ── Beat 3: stages ──
        const pb = (p - TOUR_OPEN_END) / (TOUR_CLOSE_START - TOUR_OPEN_END);
        const ns = Math.min(TOUR_STAGE_COUNT - 1, Math.floor(pb * TOUR_STAGE_COUNT));
        pose(1, 1, 0);
        setOpened(true);
        setStage((prev) => (prev === ns ? prev : ns));
      } else if (p < TOUR_SHUT_END) {
        // ── Beat 4: closing (mirror of beat 2) ──
        const t = smooth((p - TOUR_CLOSE_START) / (TOUR_SHUT_END - TOUR_CLOSE_START));
        const off = 1 - Math.max(0, Math.min(1, (t - 0.05) / 0.35));
        pose(1 - t, off, 0);
        setOpened(false);
        setStage((prev) => (prev === TOUR_STAGE_COUNT - 1 ? prev : TOUR_STAGE_COUNT - 1));
      } else {
        // ── Beat 5: held fully shut again ──
        pose(0, 0, 0);
        setOpened(false);
      }
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [reducedMotion]);

  const activeId = items[stage]?.id;

  return (
    <section
      ref={sectionRef}
      className="relative"
      // 110vh for the lid-opening act + ~55vh of scroll per UI stage.
      // Tighter than a full 100vh/stage so the tour releases promptly and
      // the next section doesn't feel a mile away.
      style={{ minHeight: `calc(110vh + ${TOUR_STAGE_COUNT * 55}vh)` }}
    >
      {/* Sticky viewport — pins the tour centered while section scrolls. */}
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          {/* Header */}
          <div className="mb-6 text-center sm:mb-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-violet-300/70">
              {copy.features.eyebrow}
            </p>
            <h2 className="text-3xl font-black tracking-[-0.03em] sm:text-4xl md:text-5xl">
              <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                {copy.features.headlineLead}
              </span>{" "}
              <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                {copy.features.headlineAccent}
              </span>
            </h2>
          </div>

          {/* Grid: left callouts / laptop / right callouts.  Center column
              is dominant (0.75fr / 3.5fr / 0.75fr) — laptop takes most of
              the width so screenshot detail reads sharply. */}
          <div className="relative grid gap-3 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,3.5fr)_minmax(0,0.75fr)] lg:items-center lg:gap-4">
            {/* SVG arrows — only active-stage arrow gets full opacity. */}
            <svg
              aria-hidden="true"
              viewBox={`0 0 ${TOUR_VB.w} ${TOUR_VB.h}`}
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 z-20 hidden h-full w-full lg:block"
            >
              <defs>
                <linearGradient id="arrow-cyan" x1="0" x2="1" y1="0" y2="0">
                  <stop offset="0%" stopColor="rgba(0,240,255,0)" />
                  <stop offset="60%" stopColor="rgba(0,240,255,0.6)" />
                  <stop offset="100%" stopColor="rgba(0,240,255,1)" />
                </linearGradient>
                <marker
                  id="arrow-head"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="8"
                  markerHeight="8"
                  orient="auto-start-reverse"
                >
                  <path d="M0,0 L10,5 L0,10 z" fill="rgba(0,240,255,1)" />
                </marker>
              </defs>
              {TOUR_ARROWS.map((a, i) => {
                const midX = (a.fromX + a.toX) / 2;
                const midY = (a.fromY + a.toY) / 2 + (i % 2 === 0 ? -30 : 30);
                const d = `M ${a.fromX} ${a.fromY} Q ${midX} ${midY} ${a.toX} ${a.toY}`;
                const isActive = a.id === activeId;
                return (
                  <path
                    key={a.id}
                    d={d}
                    fill="none"
                    stroke="url(#arrow-cyan)"
                    strokeWidth={isActive ? 2 : 1}
                    strokeDasharray="3 4"
                    markerEnd={isActive ? "url(#arrow-head)" : undefined}
                    style={{
                      opacity: !opened ? 0 : isActive ? 1 : 0.14,
                      transition: "opacity 500ms ease, stroke-width 500ms ease",
                    }}
                  />
                );
              })}
            </svg>

            {/* LEFT callouts — desktop only; on mobile a single compact
                active-callout card renders under the laptop instead.
                Hidden (opacity) during the lid-opening act. */}
            <div
              className="order-2 hidden flex-col gap-3 transition-opacity duration-700 lg:order-1 lg:flex"
              style={{ opacity: opened ? 1 : 0 }}
            >
              {items
                .filter((it) => TOUR_LEFT_IDS.has(it.id as TourFeatureId))
                .map((item) => {
                  const idx = items.findIndex((x) => x.id === item.id);
                  return (
                    <TourCallout
                      key={item.id}
                      item={item}
                      index={idx}
                      side="left"
                      onOpen={onOpen}
                      isActive={stage === idx}
                      comingSoonLabel={copy.features.comingSoonLabel}
                      learnMore={copy.features.learnMore}
                    />
                  );
                })}
            </div>

            {/* CENTER: laptop */}
            <div className="relative order-1 lg:order-2">
              {/* Ambient halo — stronger than a typical card glow; the
                  laptop is the hero object of the whole page. */}
              <div className="pointer-events-none absolute -inset-12 rounded-[4rem] bg-gradient-to-br from-violet-500/30 via-transparent to-cyan-500/30 blur-3xl" />
              <div className="pointer-events-none absolute inset-x-0 -bottom-10 h-24 rounded-[100%] bg-cyan-400/15 blur-2xl" />
              <div
                className="relative"
                style={{
                  perspective: "1400px",
                  perspectiveOrigin: "50% 30%",
                  transformStyle: "preserve-3d",
                }}
              >
                <LaptopMockup
                  ref={chassisRef}
                  lidRef={lidRef}
                  screenRef={screenRef}
                  keysRef={keysRef}
                  flashRef={flashRef}
                  baseRef={baseRef}
                  lidBackRef={lidBackRef}
                  stage={stage}
                />
              </div>
            </div>

            {/* RIGHT callouts — desktop only. */}
            <div
              className="order-3 hidden flex-col gap-3 transition-opacity duration-700 lg:flex"
              style={{ opacity: opened ? 1 : 0 }}
            >
              {items
                .filter((it) => !TOUR_LEFT_IDS.has(it.id as TourFeatureId))
                .map((item) => {
                  const idx = items.findIndex((x) => x.id === item.id);
                  return (
                    <TourCallout
                      key={item.id}
                      item={item}
                      index={idx}
                      side="right"
                      onOpen={onOpen}
                      isActive={stage === idx}
                      comingSoonLabel={copy.features.comingSoonLabel}
                      learnMore={copy.features.learnMore}
                    />
                  );
                })}
            </div>

            {/* MOBILE: single active callout under the laptop — keeps the
                sticky viewport short enough that the laptop stays visible. */}
            <div
              className="order-2 transition-opacity duration-700 lg:hidden"
              style={{ opacity: opened ? 1 : 0 }}
            >
              {items[stage] && (
                <TourCallout
                  key={items[stage].id}
                  item={items[stage]}
                  index={stage}
                  side="left"
                  onOpen={onOpen}
                  isActive
                  comingSoonLabel={copy.features.comingSoonLabel}
                  learnMore={copy.features.learnMore}
                />
              )}
            </div>
          </div>

          {/* Stage navigator — chevron arrows + clickable segment track.
              During the opening act it's swapped for a scroll hint. */}
          <div className="relative mx-auto mt-6 h-12 w-full max-w-md sm:mt-8">
            <span
              className="absolute inset-x-0 top-3 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300/60 transition-opacity duration-500"
              style={{ opacity: opened ? 0 : 1 }}
            >
              {copy.hero.scrollHint}
            </span>

            <div
              className="flex items-center gap-4 transition-opacity duration-500"
              style={{ opacity: opened ? 1 : 0, pointerEvents: opened ? "auto" : "none" }}
            >
              {/* Prev arrow */}
              <button
                type="button"
                onClick={() => goToStage(stage - 1)}
                disabled={stage === 0}
                aria-label={items[stage - 1]?.title ?? ""}
                className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/60 transition-all hover:border-cyan-300/60 hover:text-cyan-200 hover:shadow-[0_0_16px_rgba(0,240,255,0.25)] active:scale-90 disabled:pointer-events-none disabled:opacity-25"
              >
                <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>

              {/* Label + segment track */}
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.2em]">
                  <span className="text-cyan-300/90">
                    {String(stage + 1).padStart(2, "0")}
                    <span className="text-white/25"> / {String(TOUR_STAGE_COUNT).padStart(2, "0")}</span>
                  </span>
                  <span key={items[stage]?.id} className="truncate pl-3 text-white/60">
                    {items[stage]?.title}
                  </span>
                </div>
                <div className="flex gap-1">
                  {items.map((it, i) => (
                    <button
                      key={it.id}
                      type="button"
                      onClick={() => goToStage(i)}
                      aria-label={it.title}
                      className="h-1.5 flex-1 cursor-pointer rounded-full transition-all duration-300 hover:!bg-cyan-300/60"
                      style={{
                        backgroundColor:
                          i < stage ? "rgba(0,240,255,0.35)"
                          : i === stage ? "rgb(0 240 255)"
                          : "rgba(255,255,255,0.12)",
                        boxShadow: i === stage ? "0 0 12px rgba(0,240,255,0.55)" : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              {/* Next arrow */}
              <button
                type="button"
                onClick={() => goToStage(stage + 1)}
                disabled={stage === TOUR_STAGE_COUNT - 1}
                aria-label={items[stage + 1]?.title ?? ""}
                className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/60 transition-all hover:border-cyan-300/60 hover:text-cyan-200 hover:shadow-[0_0_16px_rgba(0,240,255,0.25)] active:scale-90 disabled:pointer-events-none disabled:opacity-25"
              >
                <svg className="h-4 w-4 transition-transform group-hover:translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// LaptopMockup — CSS laptop chassis with REAL AssistantX UI screenshots
// inside (captured from the desktop app's Meridian shell at 1440×900,
// which is exactly the 16:10 screen aspect).  Six images swap based on
// `stage` with a cross-fade.  All six render stacked so the browser
// preloads them — no flash on first stage switch.
// ─────────────────────────────────────────────────────────────
const TOUR_SCREENSHOTS = [
  "/media/ui/01-coding.png",
  "/media/ui/02-memory.png",
  "/media/ui/03-desktop.png",
  "/media/ui/04-reasoning.png",
  "/media/ui/05-agents.png",
  "/media/ui/06-voice.png",
] as const;

type LaptopMockupProps = {
  stage: number;
  lidRef: React.Ref<HTMLDivElement>;
  screenRef: React.Ref<HTMLDivElement>;
  keysRef: React.Ref<HTMLDivElement>;
  flashRef: React.Ref<HTMLDivElement>;
  baseRef: React.Ref<HTMLDivElement>;
  lidBackRef: React.Ref<HTMLDivElement>;
};

// The lid rotates around its BOTTOM edge (the hinge).  Closed = rotateX
// around -84° (screen folded down onto the deck, aluminum back facing the
// viewer from above); open = 0°.  The parent scroll handler drives lidRef's
// transform; SSR ships the closed pose so there's no flash of an open
// laptop before hydration.
const LaptopMockup = forwardRef<HTMLDivElement, LaptopMockupProps>(function LaptopMockup(
  { stage, lidRef, screenRef, keysRef, flashRef, baseRef, lidBackRef },
  ref,
) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[960px]"
      style={{
        transformStyle: "preserve-3d",
        // SSR pose = fully closed on a desk, viewed from high above, so
        // the first paint matches scroll position 0 exactly (see pose()).
        transform: "scale(0.86) rotateX(30deg)",
        transition: "transform 60ms linear",
      }}
    >

      {/* ── LID — rotates on the hinge (bottom edge). ── */}
      <div
        ref={lidRef}
        className="relative"
        style={{
          transformStyle: "preserve-3d",
          transformOrigin: "50% 100%",
          transform: "rotateX(-90deg)",
          transition: "transform 60ms linear",
        }}
      >
        {/* Front face — bezel + screen. Hidden when the lid shows its back. */}
        <div
          className="relative overflow-hidden rounded-t-xl border border-white/10 bg-[#050508]"
          style={{
            backfaceVisibility: "hidden",
            boxShadow:
              "0 40px 80px -20px rgba(0,240,255,0.15), 0 20px 40px -10px rgba(120,80,220,0.2), inset 0 0 0 1px rgba(255,255,255,0.03)",
          }}
        >
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#08080c]">
            {/* Lid emblem — sits UNDER the screenshot stack, so it reads as
                the aluminum cover while the laptop is closed / screen off,
                and the powering-on screen simply covers it.  Zero JS. */}
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-4"
              style={{
                background: "linear-gradient(145deg, #16161f 0%, #0c0c13 45%, #111119 100%)",
              }}
            >
              <span className="flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-blue-600 shadow-[0_0_60px_rgba(120,80,220,0.6)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/jarvis-logo.svg" alt="" className="h-11 w-11" />
              </span>
              <span className="font-mono text-[11px] uppercase tracking-[0.5em] text-white/30">
                AssistantX
              </span>
            </div>
            {/* Screen content wrapper — parent fades this in as the laptop
                "powers on" mid-way through the lid opening. */}
            <div ref={screenRef} className="absolute inset-0" style={{ opacity: 0, transition: "opacity 200ms linear" }}>
              {TOUR_SCREENSHOTS.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  loading={i === 0 ? "eager" : "lazy"}
                  className="absolute inset-0 h-full w-full object-cover"
                  style={{
                    opacity: stage === i ? 1 : 0,
                    transition: "opacity 450ms ease",
                  }}
                />
              ))}
            </div>
            {/* Power-on flash — bright cyan-white burst the moment the
                panel wakes, fading as the picture settles.  Driven by the
                scroll handler via flashRef. */}
            <div
              ref={flashRef}
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: 0,
                background:
                  "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(210,250,255,0.95), rgba(0,240,255,0.35) 60%, transparent 85%)",
                transition: "opacity 120ms linear",
              }}
            />
            {/* Very light corner sheen — kept intentionally faint so it
                doesn't wash any detail out of the actual screenshots. */}
            <div className="pointer-events-none absolute top-0 left-0 h-1/3 w-1/3 bg-gradient-to-br from-white/[0.03] to-transparent" />
          </div>
        </div>

        {/* Back face — machined aluminum lid cover with the glowing brand
            mark.  rotateX(180) so it faces the viewer while the lid is
            closed; this is the whole "hero object on a desk" shot. */}
        <div
          ref={lidBackRef}
          className="absolute inset-0 flex flex-col items-center justify-center gap-5 rounded-xl border border-white/[0.14]"
          style={{
            transform: "rotateX(180deg)",
            backfaceVisibility: "hidden",
            background:
              "linear-gradient(152deg, #1b1b25 0%, #0e0e15 40%, #08080d 70%, #12121b 100%)",
            boxShadow:
              "inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(255,255,255,0.04)",
            transition: "opacity 120ms linear",
          }}
        >
          {/* Brushed-metal micro-grain — sells "aluminum", costs nothing. */}
          <span
            className="pointer-events-none absolute inset-0 rounded-xl opacity-[0.07]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(105deg, rgba(255,255,255,0.9) 0 1px, transparent 1px 3px)",
            }}
          />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-[22px] bg-gradient-to-br from-violet-600 via-purple-600 to-blue-600 shadow-[0_0_70px_rgba(120,80,220,0.65)]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jarvis-logo.svg" alt="" className="h-11 w-11" />
          </span>
          <span className="relative font-mono text-[13px] uppercase tracking-[0.55em] text-white/25">
            AssistantX
          </span>
        </div>
      </div>

      {/* ── BASE — keyboard deck, foreshortened flat toward the viewer.
              Starts invisible: while the lid is shut it would otherwise
              stick out below the fold and break the "closed" illusion. ── */}
      <div
        ref={baseRef}
        className="relative"
        style={{
          transformStyle: "preserve-3d",
          transformOrigin: "50% 0%",
          transform: "rotateX(-76deg)",
          height: "clamp(120px, 34vw, 210px)",
          opacity: 0,
          transition: "opacity 120ms linear",
        }}
      >
        <div
          className="absolute inset-0 rounded-b-2xl border border-white/10 border-t-white/20 px-[6%] pt-[3%]"
          style={{
            background: "linear-gradient(180deg, #191922 0%, #101016 60%, #0b0b10 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          {/* Keyboard backlight bloom — parent brightens it as the screen
              powers on.  It's the one flourish people remember. */}
          <div
            ref={keysRef}
            className="pointer-events-none absolute inset-x-[5%] top-[2%] h-[55%] rounded-lg"
            style={{
              opacity: 0.15,
              transition: "opacity 200ms linear",
              background:
                "radial-gradient(ellipse 70% 90% at 50% 40%, rgba(0,240,255,0.35), rgba(120,80,220,0.15) 60%, transparent 80%)",
              filter: "blur(10px)",
            }}
          />
          {/* Key grid — 5 rows.  Pure CSS, reads as a keyboard at a glance. */}
          <div className="relative grid gap-[3px]" style={{ height: "55%" }}>
            {[14, 14, 13, 12, 9].map((cols, r) => (
              <div key={r} className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {Array.from({ length: cols }, (_, k) => (
                  <span
                    key={k}
                    className="rounded-[2px] border border-white/[0.06] bg-white/[0.045]"
                  />
                ))}
              </div>
            ))}
          </div>
          {/* Trackpad. */}
          <div className="mx-auto mt-[2.5%] h-[26%] w-[34%] rounded-md border border-white/[0.08] bg-white/[0.03]" />
        </div>
      </div>
    </div>
  );
});

// One callout box on the feature tour.  Active callout gets a cyan glow +
// scale-up + full-opacity treatment; the other five dim to ~42%.
function TourCallout({
  item,
  index,
  side,
  onOpen,
  isActive,
  comingSoonLabel,
  learnMore,
}: {
  item: FeatureCopy;
  index: number;
  side: "left" | "right";
  onOpen: (f: FeatureCopy) => void;
  isActive: boolean;
  comingSoonLabel: string;
  learnMore: string;
}) {
  const label = String(index + 1).padStart(2, "0");
  return (
    <button
      type="button"
      onClick={() => onOpen(item)}
      className="group relative overflow-hidden rounded-2xl p-4 text-left backdrop-blur-sm transition-all duration-500"
      style={{
        borderWidth: 1,
        borderStyle: "solid",
        borderColor: isActive ? "rgba(0,240,255,0.6)" : "rgba(255,255,255,0.06)",
        background: isActive ? "rgba(0,240,255,0.06)" : "rgba(255,255,255,0.02)",
        opacity: isActive ? 1 : 0.42,
        boxShadow: isActive ? "0 0 22px rgba(0,240,255,0.25)" : "none",
        transform: isActive ? "scale(1.03)" : "scale(0.98)",
      }}
    >
      <span
        className={`absolute top-3 bottom-3 w-px bg-gradient-to-b from-transparent via-cyan-300 to-transparent ${side === "left" ? "right-0" : "left-0"}`}
        style={{ opacity: isActive ? 1 : 0.25 }}
      />
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-cyan-300/90">
          // {label} · {item.id.toUpperCase()}
        </span>
        {item.comingSoon && (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
            {comingSoonLabel}
          </span>
        )}
      </div>
      <h3 className="mt-1.5 text-sm font-bold tracking-tight text-white sm:text-base">{item.title}</h3>
      <p className="mt-1 hidden text-xs leading-relaxed text-white/55 lg:block">{item.subtitle}</p>
      {isActive && (
        <span className="mt-2 flex items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-cyan-300/80">
          {learnMore}
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </span>
      )}
    </button>
  );
}

// ─────────────────────────────────────────────────────────────
// Comparison table — the original "Beyond chatbots" table, minus the
// "operating system" language, minus the "Jarvis" column name.
// ─────────────────────────────────────────────────────────────
function ComparisonSection({
  copy,
  expandedRow,
  onToggleRow,
}: {
  copy: LandingCopy;
  expandedRow: number | null;
  onToggleRow: (n: number | null) => void;
}) {
  return (
    <section className="relative px-6 py-32">
      <div className="mx-auto max-w-3xl">
        <div className="mb-14 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-violet-300/70">
            AssistantX vs.
          </p>
          <h2 className="text-4xl font-black tracking-[-0.03em] sm:text-5xl">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              {copy.comparison.headlineLead}
            </span>{" "}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              {copy.comparison.headlineAccent}
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-white/45">{copy.comparison.subtitle}</p>
        </div>

        <div className="overflow-hidden rounded-3xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm">
          <div className="grid grid-cols-3 border-b border-white/[0.06] px-8 py-5">
            <span className="text-sm font-medium text-white/40">{copy.comparison.columnFeature}</span>
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-center text-sm font-bold text-transparent">
              {copy.comparison.columnUs}
            </span>
            <span className="text-center text-sm text-white/30">{copy.comparison.columnThem}</span>
          </div>
          {copy.comparison.rows.map((row, i) => {
            const open = expandedRow === i;
            return (
              <button
                key={row.feature}
                type="button"
                onClick={() => onToggleRow(open ? null : i)}
                className="block w-full cursor-pointer border-b border-white/[0.03] text-left transition-colors last:border-b-0 hover:bg-white/[0.02]"
              >
                <div className="grid grid-cols-3 px-8 py-4">
                  <span
                    className={`flex items-center gap-2 text-sm transition-colors ${open ? "text-white" : "text-white/60"}`}
                  >
                    <svg
                      className={`h-3 w-3 shrink-0 transition-transform ${open ? "rotate-90 text-violet-300" : "text-white/25"}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                    </svg>
                    {row.feature}
                  </span>
                  <span className="text-center text-lg">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500/20">
                      <svg className="h-3.5 w-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    </span>
                  </span>
                  <span className="text-center text-lg">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-red-500/10">
                      <svg className="h-3.5 w-3.5 text-red-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </span>
                  </span>
                </div>
                {open && (
                  <div className="px-8 pb-4">
                    <p className="border-l-2 border-violet-400/40 pl-5 text-sm leading-relaxed text-violet-100/60">
                      {row.why}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Waitlist — form + counter + name-mechanic + GDPR disclosure text.
// ─────────────────────────────────────────────────────────────
function WaitlistSection({ copy }: { copy: LandingCopy }) {
  const [waitlistCount] = useState(WAITLIST_START_COUNT);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formWebsite, setFormWebsite] = useState(""); // honeypot — always empty
  const [submitting, setSubmitting] = useState(false);
  const [state, setState] = useState<"idle" | "success-first" | "success-already" | "pending" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: formName, email: formEmail, website: formWebsite }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setState("error");
        setErrorMsg(copy.waitlist.errorRateLimited);
        return;
      }
      if (!res.ok) throw new Error("request failed");
      if (data?.pendingConfirmation) setState("pending");
      else if (data?.duplicate || data?.alreadyConfirmed) setState("success-already");
      else setState("success-first");
    } catch {
      setState("error");
      setErrorMsg(copy.waitlist.errorGeneric);
    } finally {
      setSubmitting(false);
    }
  };

  const showForm = state === "idle" || state === "error";

  return (
    <section className="relative px-6 py-32">
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute top-1/2 left-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-[120px]"
          style={{ background: "rgba(120,80,220,0.35)" }}
        />
      </div>

      <div className="relative mx-auto max-w-md">
        <div className="mb-12 text-center">
          <p className="mb-4 text-xs font-semibold uppercase tracking-[0.3em] text-violet-300/70">
            {copy.waitlist.eyebrow}
          </p>
          <h2 className="text-4xl font-black tracking-[-0.03em] sm:text-5xl">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              {copy.waitlist.headlineLead}
            </span>{" "}
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              {copy.waitlist.headlineAccent}
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-sm text-white/50">{copy.waitlist.subtitle}</p>
        </div>

        {/* Corner accent stripes — cyan lines at TL + BR give the card a
            circuit-diagram look without overwhelming.  Absolute pseudo-
            corners on the same element the border already lives on. */}
        <div className="relative rounded-3xl border border-white/[0.1] bg-gradient-to-b from-white/[0.05] to-white/[0.02] p-8 shadow-2xl shadow-purple-500/10 backdrop-blur-xl">
          <span className="pointer-events-none absolute -top-px -left-px h-8 w-8 rounded-tl-3xl border-t-2 border-l-2 border-cyan-300/50" />
          <span className="pointer-events-none absolute -right-px -bottom-px h-8 w-8 rounded-br-3xl border-r-2 border-b-2 border-violet-400/50" />
          {!showForm && (
            <div className="py-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20">
                <svg className="h-8 w-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="text-xl font-bold">
                {state === "pending" ? copy.waitlist.pendingTitle
                  : state === "success-already" ? copy.waitlist.successTitleAlready
                  : copy.waitlist.successTitleFirst}
              </h3>
              <p className="mt-2 text-sm text-white/40">
                {state === "pending" ? copy.waitlist.pendingBody
                  : state === "success-already" ? copy.waitlist.successBodyAlready
                  : copy.waitlist.successBodyFirst}
              </p>
            </div>
          )}

          {showForm && (
            <form onSubmit={onSubmit} className="space-y-4" noValidate>
              {/* Honeypot — hidden from humans, filled by naive bots.  If
                  present at all we drop the submit server-side. */}
              <input
                type="text"
                name="website"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={formWebsite}
                onChange={(e) => setFormWebsite(e.target.value)}
                style={{ position: "absolute", left: "-9999px", height: 1, width: 1, opacity: 0 }}
              />
              <input
                type="text"
                required
                placeholder={copy.waitlist.namePlaceholder}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-5 py-3.5 text-sm placeholder:text-white/25 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
              />
              <input
                type="email"
                required
                placeholder={copy.waitlist.emailPlaceholder}
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full rounded-xl border border-white/[0.08] bg-white/[0.05] px-5 py-3.5 text-sm placeholder:text-white/25 focus:border-violet-500/50 focus:outline-none focus:ring-1 focus:ring-violet-500/20"
              />
              <button
                type="submit"
                disabled={submitting}
                className="group relative w-full overflow-hidden rounded-xl py-4 text-sm font-semibold transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-60"
              >
                <span className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600" />
                <span className="absolute inset-0 bg-gradient-to-r from-violet-500 to-blue-500 opacity-0 transition-opacity group-hover:opacity-100" />
                <span className="absolute inset-0 shadow-[0_0_60px_rgba(120,80,220,0.4)] transition-shadow group-hover:shadow-[0_0_80px_rgba(120,80,220,0.6)]" />
                <span className="relative z-10">{submitting ? copy.waitlist.submitLoading : copy.waitlist.submitIdle}</span>
              </button>
              {errorMsg && <p className="text-center text-xs text-red-400/80">{errorMsg}</p>}
              {/* Two distinct disclosures — the name-mechanic one and the
                  GDPR one — deliberately shown side by side per the brief. */}
              <p className="text-center text-[11px] leading-relaxed text-white/40">
                {copy.waitlist.disclosureName}
              </p>
              <p className="text-center text-[11px] leading-relaxed text-white/30">
                {copy.waitlist.disclosureGdprPrefix}
                {/* TODO(Owner): replace #privacy with the real Privacy
                    Policy URL once the document exists. Do NOT generate
                    the policy text automatically — legal doc. */}
                <a href="#privacy" className="underline decoration-white/20 underline-offset-2 hover:text-white/60">
                  {copy.waitlist.disclosureGdprLink}
                </a>
                {copy.waitlist.disclosureGdprSuffix}
              </p>
            </form>
          )}

          {/* Live counter — kept from the previous landing.  Static number
              from a client hook, no backend fetch (was static before too). */}
          <div className="mt-6 border-t border-white/[0.06] pt-5 text-center">
            <div className="inline-flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </span>
              <span className="text-sm text-white/50">
                <span className="font-bold text-white/80">{waitlistCount.toLocaleString()}</span>{" "}
                {copy.waitlist.counterSuffix}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Community section — Discord + Docs + Roadmap.
// Docs still points at "#" pending a real docs site — that's a TODO(Owner).
// ─────────────────────────────────────────────────────────────
function CommunitySection({ copy }: { copy: LandingCopy }) {
  const cards = [
    {
      label: copy.community.cards.discord.label,
      desc: copy.community.cards.discord.desc,
      href: "https://discord.gg/mpjHw5QD",
      gradient: "from-indigo-500 to-violet-500",
      icon: (
        <svg className="h-5 w-5 text-white" viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
        </svg>
      ),
    },
    {
      label: copy.community.cards.docs.label,
      desc: copy.community.cards.docs.desc,
      // TODO(Owner): replace with the real docs URL once /docs exists.
      href: "#docs",
      gradient: "from-blue-500 to-cyan-500",
      icon: (
        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
        </svg>
      ),
    },
    {
      label: copy.community.cards.roadmap.label,
      desc: copy.community.cards.roadmap.desc,
      href: "/roadmap",
      gradient: "from-violet-500 to-fuchsia-500",
      icon: (
        <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
        </svg>
      ),
    },
  ];

  return (
    <section className="relative px-6 py-24">
      <div className="mx-auto max-w-2xl">
        <div className="mb-12 text-center">
          <h2 className="text-3xl font-black tracking-[-0.03em] sm:text-4xl">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              {copy.community.headlineLead}
            </span>
          </h2>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {cards.map((c) => (
            <a
              key={c.label}
              href={c.href}
              target={c.href.startsWith("http") ? "_blank" : undefined}
              rel={c.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="group block rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center transition-all hover:-translate-y-0.5 hover:border-white/[0.14] hover:bg-white/[0.04]"
            >
              <span
                className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br ${c.gradient} opacity-90 ring-1 ring-inset ring-white/20 transition-all group-hover:scale-110 group-hover:opacity-100`}
              >
                {c.icon}
              </span>
              <h3 className="text-sm font-bold tracking-tight transition-colors group-hover:text-violet-300">{c.label}</h3>
              <p className="mt-1 text-xs text-white/30">{c.desc}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────
// Feature explainer modal — opens when a feature card is clicked.
// ─────────────────────────────────────────────────────────────
function FeatureModal({
  feature,
  copy,
  onClose,
}: {
  feature: FeatureCopy | null;
  copy: LandingCopy;
  onClose: () => void;
}) {
  if (!feature) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      onClick={onClose}
      role="presentation"
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={feature.title}
        onClick={(e) => e.stopPropagation()}
        className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-white/[0.1] bg-[#0a0a12] p-8 shadow-2xl shadow-purple-500/10"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-5 top-5 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/50 transition-all hover:border-white/25 hover:text-white active:scale-90"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div
          className={`mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${feature.gradient} ring-1 ring-inset ring-white/20`}
        >
          <svg className="h-7 w-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d={feature.icon} />
          </svg>
        </div>

        <div className="flex items-center gap-2">
          <h3 className="text-2xl font-black tracking-tight">{feature.title}</h3>
          {feature.comingSoon && (
            <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
              {copy.features.comingSoonLabel}
            </span>
          )}
        </div>
        <p className="mt-1 text-sm text-white/40">{feature.subtitle}</p>
        <p className="mt-5 text-[15px] leading-relaxed text-white/70">{feature.body}</p>
        <ul className="mt-6 space-y-3">
          {feature.bullets.map((b) => (
            <li key={b} className="flex items-start gap-3 text-sm text-white/60">
              <span
                className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${feature.gradient} opacity-80`}
              >
                <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </span>
              {b}
            </li>
          ))}
        </ul>
        <a
          href={`#${SMOOTH_SCROLL_TARGET}`}
          onClick={onClose}
          className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-300 transition-colors hover:text-violet-200"
        >
          {copy.hero.ctaJoin}
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
        </a>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Footer — logo + product name + copyright.  Branding sanitized to
// "AssistantX" only per the brief (no compound "AssistantX-Jarvis").
// ─────────────────────────────────────────────────────────────
function Footer({ copy }: { copy: LandingCopy }) {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-white/[0.05] px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 sm:flex-row">
        <Link href="/" className="flex items-center gap-3">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-blue-600">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jarvis-logo.svg" alt="" className="h-[18px] w-[18px]" />
          </span>
          <span className="text-sm text-white/40">{copy.footer.tagline}</span>
        </Link>
        <div className="text-xs text-white/20">
          {copy.footer.copyright.replace("{year}", String(year))}
        </div>
      </div>
    </footer>
  );
}
