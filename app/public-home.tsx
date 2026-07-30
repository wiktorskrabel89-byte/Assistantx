"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import type { PublicUILanguage } from "@/app/lib/ui-language";
import { STRINGS, type LandingStrings } from "@/app/lib/landing-strings";
import { LanguageSwitcher } from "@/app/components/LanguageSwitcher";
import { LaunchCountdown } from "@/app/components/LaunchCountdown";
function AnimatedSection({ children, className = "", delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <div
      className={`section-reveal ${className}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

function GlowOrb({ className, color }: { className: string; color: string }) {
  return (
    <div
      className={`pointer-events-none absolute rounded-full blur-[120px] ${className}`}
      style={{ background: color }}
    />
  );
}

// ─────────────────────────────────────────────────────────────
// Scroll-driven laptop tour.
//
// The section is ~5 viewports tall.  A sticky inner frame pins the laptop
// while scroll drives a single pose() function through five beats:
//
//   0 → 20%    lid folds up, screen powers on (flash + keyboard bloom)
//   20 → 86%   six real UI screenshots cross-fade inside the screen
//   86 → 100%  lid folds back down, screen powers off
//
// Because opening and closing both go through pose(), they can never drift
// apart.  Three constraints worth knowing before editing this:
//
//  * The page wrapper must NOT use overflow-x-hidden — that silently makes
//    every descendant's position:sticky inert.  overflow-x-clip is fine.
//  * The fold stops at -74deg, not -90deg: at a true right angle both lid
//    faces get backface-culled and the laptop vanishes from the frame.
//  * The chassis sits at zero rotation while stages show.  Any 3D rotation
//    makes the compositor resample the screenshot and softens fine text.
// ─────────────────────────────────────────────────────────────
const TOUR_SHOTS = [
  "/media/ui/01-coding.png",
  "/media/ui/02-memory.png",
  "/media/ui/03-desktop.png",
  "/media/ui/04-reasoning.png",
  "/media/ui/05-agents.png",
  "/media/ui/06-voice.png",
] as const;
const TOUR_STAGE_COUNT = TOUR_SHOTS.length;
const TOUR_OPEN_END = 0.2;
const TOUR_CLOSE_START = 0.86;
// Which stages render on the left of the laptop; the rest go right.
const TOUR_LEFT = new Set(["coding", "memory", "desktop"]);

const SHOWCASE_ITEMS = [
  {
    title: "Talk naturally",
    subtitle: "Voice-first interaction with context awareness",
    gradient: "from-violet-500 to-fuchsia-500",
    glow: "rgba(168,85,247,0.35)",
    icon: "M12 18.75a6 6 0 0 0 6-6v-1.5m-6 7.5a6 6 0 0 1-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 0 1-3-3V4.5a3 3 0 1 1 6 0v8.25a3 3 0 0 1-3 3Z",
  },
  {
    title: "Thinks before acting",
    subtitle: "Multi-step reasoning with confidence scoring",
    gradient: "from-blue-500 to-cyan-500",
    glow: "rgba(59,130,246,0.35)",
    icon: "M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18",
  },
  {
    title: "Controls your computer",
    subtitle: "Native desktop automation and app control",
    gradient: "from-emerald-500 to-teal-500",
    glow: "rgba(16,185,129,0.35)",
    icon: "M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25",
  },
  {
    title: "Uses your apps",
    subtitle: "Deep integration with every tool you use",
    gradient: "from-amber-500 to-orange-500",
    glow: "rgba(245,158,11,0.35)",
    icon: "M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z",
  },
  {
    title: "Browses the internet",
    subtitle: "Real-time research and web intelligence",
    gradient: "from-rose-500 to-pink-500",
    glow: "rgba(244,63,94,0.35)",
    icon: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
  },
  {
    title: "Writes code",
    subtitle: "Full-stack development with live preview",
    gradient: "from-indigo-500 to-violet-500",
    glow: "rgba(99,102,241,0.35)",
    icon: "M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5",
  },
  {
    title: "Creates images",
    subtitle: "Generate and edit visuals with AI models",
    gradient: "from-fuchsia-500 to-pink-500",
    glow: "rgba(217,70,239,0.35)",
    icon: "m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H3.75A1.5 1.5 0 0 0 2.25 6v12a1.5 1.5 0 0 0 1.5 1.5Zm10.5-11.25h.008v.008h-.008V8.25Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z",
  },
  {
    title: "Generates videos",
    subtitle: "AI-powered video creation and editing",
    gradient: "from-cyan-500 to-blue-500",
    glow: "rgba(6,182,212,0.35)",
    icon: "m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z",
  },
  {
    title: "Learns from you",
    subtitle: "Adaptive intelligence that evolves over time",
    gradient: "from-green-500 to-emerald-500",
    glow: "rgba(34,197,94,0.35)",
    icon: "M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5",
  },
  {
    title: "Has memory",
    subtitle: "Persistent context across all conversations",
    gradient: "from-purple-500 to-indigo-500",
    glow: "rgba(147,51,234,0.35)",
    icon: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 5.625c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125",
  },
  {
    title: "Multi-Agent Intelligence",
    subtitle: "Orchestrated AI agents working in parallel",
    gradient: "from-red-500 to-orange-500",
    glow: "rgba(239,68,68,0.35)",
    icon: "M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z",
  },
];

const SHOWCASE_DETAILS: Record<string, { body: string; bullets: string[] }> = {
  "Talk naturally": {
    body: "Jarvis listens for a wake word, verifies it's really you speaking, and understands commands in natural language — no rigid syntax. A 10-stage audio pipeline filters noise, matches your voice profile and adapts its sensitivity to the room you're in.",
    bullets: ["Wake-word activation with speaker verification", "Noise suppression tuned to your environment", "Natural language — just say what you want"],
  },
  "Thinks before acting": {
    body: "Before executing anything, Jarvis scores its own confidence, runs a reality check against known facts, and escalates to deeper reasoning when a task is ambiguous. Low confidence means it asks — instead of guessing.",
    bullets: ["Confidence scoring on every decision", "Reality Check blocks unrealistic plans", "Devil's Advocate challenges risky choices"],
  },
  "Controls your computer": {
    body: "From launching apps to orchestrating whole workflows, Jarvis operates your desktop natively — clicking, typing and moving files with your permission, never behind your back.",
    bullets: ["Native app launching and control", "Permission-gated automation", "Works across your entire desktop"],
  },
  "Uses your apps": {
    body: "Jarvis plugs into the tools you already use — calendars, mail, editors, browsers — and coordinates them in a single conversation instead of making you jump between windows.",
    bullets: ["Deep integrations, not shallow shortcuts", "Cross-app workflows in one command", "Extensible connector system"],
  },
  "Browses the internet": {
    body: "Real-time web research with source tracking: Jarvis searches, reads and synthesizes multiple pages in the background, then reports back with just the essentials.",
    bullets: ["Background research — no popup windows", "Multi-source synthesis", "Cited, verifiable answers"],
  },
  "Writes code": {
    body: "A full coding agent: it plans the change, edits across files, runs the code and verifies the output before telling you it's done. Not autocomplete — an engineer.",
    bullets: ["Multi-file editing with a plan", "Syntax and output verification", "Live preview of every change"],
  },
  "Creates images": {
    body: "Generate and edit visuals through conversation — from quick concept art to polished brand assets, automatically routed to the best available image model.",
    bullets: ["Text-to-image generation", "Editing and variations", "Smart model routing for best quality"],
  },
  "Generates videos": {
    body: "Turn a prompt or a still image into motion. Jarvis orchestrates video models for teasers, product demos and social clips — cinematic by default.",
    bullets: ["Text-to-video and image-to-video", "Cinematic presets", "Automatic aspect-ratio handling"],
  },
  "Learns from you": {
    body: "Every success and failure is analyzed, classified and turned into lessons. Skills version like software — improving with use, never silently changing behavior.",
    bullets: ["Lessons from failures and successes", "Versioned skill evolution with rollback", "Anti-poisoning validation of what it learns"],
  },
  "Has memory": {
    body: "Jarvis remembers context across conversations: your preferences, projects and past decisions — all recallable, inspectable and editable. Never a black box.",
    bullets: ["Conversation + long-term memory layers", "Decision memory with a full audit trail", "You can inspect and delete anything"],
  },
  "Multi-Agent Intelligence": {
    body: "For big tasks, Jarvis spins up specialist agents that work in parallel — researcher, coder, reviewer — coordinated by a trust-scored orchestration layer. Arriving in v2.0.",
    bullets: ["Parallel specialist agents", "Trust-scored autonomy per agent", "Adversarial verification of results"],
  },
};

const TIMELINE_ITEMS = [
  { label: "Voice", desc: "Natural speech interaction", detail: "Wake word, speaker verification and noise-robust transcription — hands-free from across the room." },
  { label: "Memory", desc: "Persistent knowledge", detail: "Layered memory that persists across sessions and projects, with full user control." },
  { label: "Agents", desc: "Multi-agent orchestration", detail: "Specialist agents coordinated in parallel on complex missions, each earning trust over time." },
  { label: "Automation", desc: "Desktop & workflow control", detail: "Desktop and workflow automation with permission gates on every real-world action." },
  { label: "Coding", desc: "Full-stack development", detail: "A coding agent that plans, edits, runs and verifies — across your whole stack." },
  { label: "Research", desc: "Deep web intelligence", detail: "Multi-source web research running in the background, synthesized with citations." },
  { label: "Planning", desc: "Strategic project execution", detail: "Long-horizon projects decomposed into verifiable steps with progress tracking." },
  { label: "Image Gen", desc: "Visual creation", detail: "Visual creation routed to the best model for each job — concepts, assets, edits." },
  { label: "Video Gen", desc: "AI video production", detail: "Cinematic video generation from prompts and stills, with automatic formatting." },
  { label: "Desktop Control", desc: "Native OS automation", detail: "Native OS-level control: apps, files, windows — operated like a human assistant would." },
  { label: "Cloud Intelligence", desc: "Distributed AI processing", detail: "Local-first processing with cloud escalation only when a task truly demands it." },
];

const COMPARISON = [
  { feature: "Understands context", jarvis: true, chatbot: false, why: "Jarvis keeps project, memory and screen context. Chatbots start from zero with every message." },
  { feature: "Controls your computer", jarvis: true, chatbot: false, why: "Chatbots can only talk about it. Jarvis actually clicks, types, launches and automates." },
  { feature: "Remembers everything", jarvis: true, chatbot: false, why: "Persistent layered memory — versus a context window that forgets as soon as it fills up." },
  { feature: "Multi-agent reasoning", jarvis: true, chatbot: false, why: "Parallel specialist agents cross-check each other's work instead of one model guessing alone." },
  { feature: "Voice-first interface", jarvis: true, chatbot: false, why: "An always-listening wake word with speaker verification — not a push-to-talk gimmick." },
  { feature: "Learns from mistakes", jarvis: true, chatbot: false, why: "Failures become versioned lessons that change future behavior. Chatbots repeat the same errors." },
  { feature: "Executes real actions", jarvis: true, chatbot: false, why: "Files, apps, code, web — real side effects, protected by permission gates you control." },
  { feature: "Works offline", jarvis: true, chatbot: false, why: "Local models keep working with no internet — and your data stays on your machine." },
];

type ModalContent = {
  title: string;
  subtitle?: string;
  body: string;
  bullets?: string[];
  gradient: string;
  icon?: string;
};

type TourStage = LandingStrings["tour"]["stages"][number];

/**
 * Each tour stage maps onto an existing SHOWCASE_ITEMS entry, so clicking a
 * callout opens the same rich modal (body + bullets from SHOWCASE_DETAILS)
 * that the old card grid used.  Keys are SHOWCASE_ITEMS titles.
 */
const TOUR_TO_SHOWCASE: Record<string, string> = {
  coding: "Writes code",
  memory: "Has memory",
  desktop: "Controls your computer",
  reasoning: "Thinks before acting",
  agents: "Multi-Agent Intelligence",
  voice: "Talk naturally",
};

/** One callout beside the laptop. Active stage gets a cyan glow + scale-up. */
function TourCallout({
  stage,
  index,
  side,
  isActive,
  learnMore,
  comingSoonLabel,
  onOpen,
}: {
  stage: TourStage;
  index: number;
  side: "left" | "right";
  isActive: boolean;
  learnMore: string;
  comingSoonLabel: string;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group relative overflow-hidden rounded-2xl p-4 text-left backdrop-blur-sm transition-all duration-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
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
          // {String(index + 1).padStart(2, "0")} · {stage.label}
        </span>
        {stage.id === "voice" && (
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-300">
            {comingSoonLabel}
          </span>
        )}
      </div>
      <h3 className="mt-1.5 text-sm font-bold tracking-tight text-white sm:text-base">{stage.title}</h3>
      <p className="mt-1 hidden text-xs leading-relaxed text-white/55 lg:block">{stage.subtitle}</p>
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

/**
 * CSS laptop chassis holding the real UI screenshots.  The parent drives
 * every ref imperatively from the scroll handler, which keeps the animation
 * off React's render path entirely.
 */
function LaptopMockup({
  stage,
  chassisRef,
  lidRef,
  lidBackRef,
  screenRef,
  keysRef,
  flashRef,
}: {
  stage: number;
  chassisRef: React.Ref<HTMLDivElement>;
  lidRef: React.Ref<HTMLDivElement>;
  lidBackRef: React.Ref<HTMLDivElement>;
  screenRef: React.Ref<HTMLDivElement>;
  keysRef: React.Ref<HTMLDivElement>;
  flashRef: React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={chassisRef}
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[960px]"
      style={{
        transformStyle: "preserve-3d",
        // SSR pose = folded, matching scroll position 0 (see pose()).
        transform: "scale(0.88) rotateX(18deg)",
        transition: "transform 60ms linear",
      }}
    >
      {/* LID — hinges on its bottom edge. */}
      <div
        ref={lidRef}
        className="relative"
        style={{
          transformStyle: "preserve-3d",
          transformOrigin: "50% 100%",
          transform: "rotateX(-74deg)",
          transition: "transform 60ms linear",
        }}
      >
        {/* Front face: bezel + screen. */}
        <div
          className="relative overflow-hidden rounded-t-xl border border-white/10 bg-[#050508]"
          style={{
            backfaceVisibility: "hidden",
            boxShadow:
              "0 40px 80px -20px rgba(0,240,255,0.15), 0 20px 40px -10px rgba(120,80,220,0.2), inset 0 0 0 1px rgba(255,255,255,0.03)",
          }}
        >
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-[#08080c]">
            <div ref={screenRef} className="absolute inset-0" style={{ opacity: 0, transition: "opacity 200ms linear" }}>
              {TOUR_SHOTS.map((src, i) => (
                <Image
                  key={src}
                  src={src}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 100vw, 960px"
                  priority={i === 0}
                  className="object-cover"
                  style={{ opacity: stage === i ? 1 : 0, transition: "opacity 450ms ease" }}
                />
              ))}
            </div>
            {/* Power-on burst the moment the panel wakes. */}
            <div
              ref={flashRef}
              className="pointer-events-none absolute inset-0"
              style={{
                opacity: 0,
                transition: "opacity 120ms linear",
                background:
                  "radial-gradient(ellipse 80% 60% at 50% 50%, rgba(210,250,255,0.95), rgba(0,240,255,0.35) 60%, transparent 85%)",
              }}
            />
            {/* Faint corner sheen — kept light so screenshot detail survives. */}
            <div className="pointer-events-none absolute top-0 left-0 h-1/3 w-1/3 bg-gradient-to-br from-white/[0.03] to-transparent" />
          </div>
        </div>

        {/* Back face: aluminium cover with the brand mark, shown while folded.
            Driven by opacity rather than backface-visibility, which some
            compositors ignore inside nested preserve-3d subtrees. */}
        <div
          ref={lidBackRef}
          className="absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-hidden rounded-xl border border-white/[0.14]"
          style={{
            transform: "rotateX(180deg)",
            backfaceVisibility: "hidden",
            background: "linear-gradient(152deg, #1b1b25 0%, #0e0e15 40%, #08080d 70%, #12121b 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.12)",
            transition: "opacity 120ms linear",
          }}
        >
          <span
            className="pointer-events-none absolute inset-0 opacity-[0.07]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(105deg, rgba(255,255,255,0.9) 0 1px, transparent 1px 3px)",
            }}
          />
          <span className="relative flex h-20 w-20 items-center justify-center rounded-[22px] bg-gradient-to-br from-violet-600 via-purple-600 to-blue-600 shadow-[0_0_70px_rgba(120,80,220,0.65)]">
            <Image src="/jarvis-logo.svg" alt="" width={44} height={44} />
          </span>
          <span className="relative font-mono text-[13px] uppercase tracking-[0.55em] text-white/25">
            AssistantX
          </span>
        </div>
      </div>

      {/* BASE — keyboard deck. Hidden while folded, else it juts out below
          the lid and the machine stops reading as closed. */}
      <div
        className="relative"
        style={{
          transformStyle: "preserve-3d",
          transformOrigin: "50% 0%",
          // POSITIVE rotation, so the deck lies forward — toward the viewer —
          // the way a real keyboard does. A negative angle swings it behind
          // the screen instead, which is what made the laptop read as though
          // it were facing away.
          transform: "rotateX(72deg)",
          height: "clamp(120px, 34vw, 210px)",
        }}
      >
        <div
          className="absolute inset-0 rounded-b-2xl border border-white/10 border-t-white/20 px-[6%] pt-[3%]"
          style={{
            background: "linear-gradient(180deg, #191922 0%, #101016 60%, #0b0b10 100%)",
            boxShadow: "inset 0 1px 0 rgba(255,255,255,0.08)",
          }}
        >
          <div
            ref={keysRef}
            className="pointer-events-none absolute inset-x-[5%] top-[2%] h-[55%] rounded-lg"
            style={{
              opacity: 0.12,
              transition: "opacity 200ms linear",
              background:
                "radial-gradient(ellipse 70% 90% at 50% 40%, rgba(0,240,255,0.35), rgba(120,80,220,0.15) 60%, transparent 80%)",
              filter: "blur(10px)",
            }}
          />
          <div className="relative grid gap-[3px]" style={{ height: "55%" }}>
            {[14, 14, 13, 12, 9].map((cols, r) => (
              <div key={r} className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
                {Array.from({ length: cols }, (_, k) => (
                  <span key={k} className="rounded-[2px] border border-white/[0.06] bg-white/[0.045]" />
                ))}
              </div>
            ))}
          </div>
          <div className="mx-auto mt-[2.5%] h-[26%] w-[34%] rounded-md border border-white/[0.08] bg-white/[0.03]" />
        </div>
      </div>
    </div>
  );
}

/** The whole sticky tour section. */
function LaptopTour({
  t,
  onOpenStage,
}: {
  t: LandingStrings;
  onOpenStage: (stage: TourStage) => void;
}) {
  const sectionRef = useRef<HTMLDivElement | null>(null);
  const chassisRef = useRef<HTMLDivElement | null>(null);
  const lidRef = useRef<HTMLDivElement | null>(null);
  const lidBackRef = useRef<HTMLDivElement | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const keysRef = useRef<HTMLDivElement | null>(null);
  const flashRef = useRef<HTMLDivElement | null>(null);
  const [stage, setStage] = useState(0);
  const [opened, setOpened] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const stages = t.tour.stages;

  useEffect(() => {
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

  const goToStage = (k: number) => {
    const section = sectionRef.current;
    if (!section) return;
    const clamped = Math.max(0, Math.min(TOUR_STAGE_COUNT - 1, k));
    const vh = window.innerHeight || 800;
    const scrollable = Math.max(1, section.offsetHeight - vh);
    const top = section.getBoundingClientRect().top + window.scrollY;
    const p =
      TOUR_OPEN_END +
      ((clamped + 0.5) / TOUR_STAGE_COUNT) * (TOUR_CLOSE_START - TOUR_OPEN_END);
    window.scrollTo({ top: top + p * scrollable, behavior: "smooth" });
  };

  useEffect(() => {
    const section = sectionRef.current;
    if (!section) return;
    const smooth = (x: number) => x * x * (3 - 2 * x);

    // `open` is 0 (folded) → 1 (fully open); every other value derives from
    // it so the opening and closing beats share identical geometry.
    const pose = (open: number, screenOn: number, flashAmt: number) => {
      if (lidRef.current) {
        // Closed = -104deg: the lid has folded FORWARD onto the deck (which
        // sits at +72deg), leaving a few degrees of gap so the two planes
        // don't z-fight. Open = 0deg, upright and facing the reader.
        // Folding forward past -90 also flips the lid, so the aluminium back
        // with the logo is what faces you when it's shut — exactly like
        // looking down at a closed laptop.
        lidRef.current.style.transform = `rotateX(${(-104 + 104 * open).toFixed(2)}deg)`;
      }
      if (lidBackRef.current) {
        lidBackRef.current.style.opacity = (1 - Math.min(1, open / 0.55)).toFixed(3);
      }
      if (chassisRef.current) {
        // Shut: viewed from a bit further above (18deg) so the folded slab
        // reads as an object on a desk. Open: almost head-on.
        chassisRef.current.style.transform =
          `scale(${(0.88 + 0.16 * open).toFixed(3)}) rotateX(${(18 - 14 * open).toFixed(2)}deg)`;
      }
      if (screenRef.current) screenRef.current.style.opacity = screenOn.toFixed(3);
      if (keysRef.current) keysRef.current.style.opacity = (0.12 + screenOn * 0.55).toFixed(3);
      if (flashRef.current) flashRef.current.style.opacity = flashAmt.toFixed(3);
      // The deck stays visible at every angle: shut, it IS the bottom case
      // the folded lid is resting on, which is what sells "closed laptop"
      // rather than "floating panel".
    };

    const update = () => {
      const rect = section.getBoundingClientRect();
      const vh = window.innerHeight || 800;
      const scrollable = Math.max(1, rect.height - vh);
      const p = Math.max(0, Math.min(0.9999, Math.max(0, -rect.top) / scrollable));

      if (reducedMotion) {
        pose(1, 1, 0);
        setOpened(true);
        const ns = Math.min(TOUR_STAGE_COUNT - 1, Math.floor(p * TOUR_STAGE_COUNT));
        setStage((prev) => (prev === ns ? prev : ns));
        return;
      }

      if (p < TOUR_OPEN_END) {
        const x = smooth(p / TOUR_OPEN_END);
        const on = Math.max(0, Math.min(1, (x - 0.6) / 0.32));
        const flash = on > 0 && on < 0.45 ? ((0.45 - on) / 0.45) * 0.6 : 0;
        pose(x, on, flash);
        setOpened(false);
        setStage((prev) => (prev === 0 ? prev : 0));
      } else if (p < TOUR_CLOSE_START) {
        const pb = (p - TOUR_OPEN_END) / (TOUR_CLOSE_START - TOUR_OPEN_END);
        const ns = Math.min(TOUR_STAGE_COUNT - 1, Math.floor(pb * TOUR_STAGE_COUNT));
        pose(1, 1, 0);
        setOpened(true);
        setStage((prev) => (prev === ns ? prev : ns));
      } else {
        const x = smooth((p - TOUR_CLOSE_START) / (1 - TOUR_CLOSE_START));
        const off = 1 - Math.max(0, Math.min(1, (x - 0.05) / 0.35));
        pose(1 - x, off, 0);
        setOpened(false);
        setStage((prev) => (prev === TOUR_STAGE_COUNT - 1 ? prev : TOUR_STAGE_COUNT - 1));
      }
    };

    update();
    // Deliberately no rAF throttle: rAF is paused in background/hidden
    // frames, which strands the laptop mid-fold.  A single inline-style
    // write per event batches into the compositor's own frame anyway.
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [reducedMotion]);

  return (
    <section
      ref={sectionRef}
      className="relative"
      style={{ minHeight: `calc(110vh + ${TOUR_STAGE_COUNT * 55}vh)` }}
    >
      <div className="sticky top-0 flex h-screen flex-col justify-center overflow-hidden px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-6 text-center sm:mb-8">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.3em] text-violet-300/70">
              {t.tour.eyebrow}
            </p>
            <h2 className="text-3xl font-black tracking-[-0.03em] sm:text-4xl md:text-5xl">
              <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
                {t.showcaseHeading.top}
              </span>{" "}
              <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
                {t.showcaseHeading.bottom}
              </span>
            </h2>
          </div>

          <div className="relative grid gap-3 lg:grid-cols-[minmax(0,0.75fr)_minmax(0,3.5fr)_minmax(0,0.75fr)] lg:items-center lg:gap-4">
            {/* Left callouts (desktop only). */}
            <div
              className="order-2 hidden flex-col gap-3 transition-opacity duration-700 lg:order-1 lg:flex"
              style={{ opacity: opened ? 1 : 0 }}
            >
              {stages.filter((s) => TOUR_LEFT.has(s.id)).map((s) => {
                const idx = stages.findIndex((x) => x.id === s.id);
                return (
                  <TourCallout
                    key={s.id}
                    stage={s}
                    index={idx}
                    side="left"
                    isActive={stage === idx}
                    learnMore={t.tour.learnMore}
                    comingSoonLabel={t.tour.comingSoon}
                    onOpen={() => onOpenStage(s)}
                  />
                );
              })}
            </div>

            {/* The laptop. */}
            <div className="relative order-1 lg:order-2">
              <div className="pointer-events-none absolute -inset-12 rounded-[4rem] bg-gradient-to-br from-violet-500/30 via-transparent to-cyan-500/30 blur-3xl" />
              <div className="pointer-events-none absolute inset-x-0 -bottom-10 h-24 rounded-[100%] bg-cyan-400/15 blur-2xl" />
              <div
                className="relative"
                style={{ perspective: "1400px", perspectiveOrigin: "50% 30%", transformStyle: "preserve-3d" }}
              >
                <LaptopMockup
                  stage={stage}
                  chassisRef={chassisRef}
                  lidRef={lidRef}
                  lidBackRef={lidBackRef}
                  screenRef={screenRef}
                  keysRef={keysRef}
                  flashRef={flashRef}
                />
              </div>
            </div>

            {/* Right callouts (desktop only). */}
            <div
              className="order-3 hidden flex-col gap-3 transition-opacity duration-700 lg:flex"
              style={{ opacity: opened ? 1 : 0 }}
            >
              {stages.filter((s) => !TOUR_LEFT.has(s.id)).map((s) => {
                const idx = stages.findIndex((x) => x.id === s.id);
                return (
                  <TourCallout
                    key={s.id}
                    stage={s}
                    index={idx}
                    side="right"
                    isActive={stage === idx}
                    learnMore={t.tour.learnMore}
                    comingSoonLabel={t.tour.comingSoon}
                    onOpen={() => onOpenStage(s)}
                  />
                );
              })}
            </div>

            {/* Mobile: just the active callout, so the laptop always fits. */}
            <div
              className="order-2 transition-opacity duration-700 lg:hidden"
              style={{ opacity: opened ? 1 : 0 }}
            >
              {stages[stage] && (
                <TourCallout
                  stage={stages[stage]}
                  index={stage}
                  side="left"
                  isActive
                  learnMore={t.tour.learnMore}
                  comingSoonLabel={t.tour.comingSoon}
                  onOpen={() => onOpenStage(stages[stage])}
                />
              )}
            </div>
          </div>

          {/* Stage navigator: arrows + clickable segment track. */}
          <div className="relative mx-auto mt-6 h-12 w-full max-w-md sm:mt-8">
            <span
              className="absolute inset-x-0 top-3 text-center font-mono text-[10px] uppercase tracking-[0.3em] text-cyan-300/60 transition-opacity duration-500"
              style={{ opacity: opened ? 0 : 1 }}
            >
              {t.tour.scrollHint}
            </span>
            <div
              className="flex items-center gap-4 transition-opacity duration-500"
              style={{ opacity: opened ? 1 : 0, pointerEvents: opened ? "auto" : "none" }}
            >
              <button
                type="button"
                onClick={() => goToStage(stage - 1)}
                disabled={stage === 0}
                aria-label={stages[stage - 1]?.title ?? ""}
                className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/60 transition-all hover:border-cyan-300/60 hover:text-cyan-200 active:scale-90 disabled:pointer-events-none disabled:opacity-25"
              >
                <svg className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                </svg>
              </button>

              <div className="min-w-0 flex-1">
                <div className="mb-1.5 flex items-baseline justify-between font-mono text-[10px] uppercase tracking-[0.2em]">
                  <span className="text-cyan-300/90">
                    {String(stage + 1).padStart(2, "0")}
                    <span className="text-white/25"> / {String(TOUR_STAGE_COUNT).padStart(2, "0")}</span>
                  </span>
                  <span className="truncate pl-3 text-white/60">{stages[stage]?.title}</span>
                </div>
                <div className="flex gap-1">
                  {stages.map((s, i) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => goToStage(i)}
                      aria-label={s.title}
                      className="h-1.5 flex-1 cursor-pointer rounded-full transition-all duration-300 hover:!bg-cyan-300/60"
                      style={{
                        backgroundColor:
                          i < stage ? "rgba(0,240,255,0.35)" : i === stage ? "rgb(0 240 255)" : "rgba(255,255,255,0.12)",
                        boxShadow: i === stage ? "0 0 12px rgba(0,240,255,0.55)" : "none",
                      }}
                    />
                  ))}
                </div>
              </div>

              <button
                type="button"
                onClick={() => goToStage(stage + 1)}
                disabled={stage === TOUR_STAGE_COUNT - 1}
                aria-label={stages[stage + 1]?.title ?? ""}
                className="group flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/[0.03] text-white/60 transition-all hover:border-cyan-300/60 hover:text-cyan-200 active:scale-90 disabled:pointer-events-none disabled:opacity-25"
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

export default function PublicHome({
  lang = "en",
  waitlistCount: initialCount = 1,
  launchDate = null,
}: {
  lang?: PublicUILanguage;
  waitlistCount?: number;
  launchDate?: string | null;
}) {
  const t = STRINGS[lang];
  const [waitlistCount] = useState(initialCount);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formWebsite, setFormWebsite] = useState(""); // honeypot — stays empty
  const [submitted, setSubmitted] = useState(false);
  const [alreadyOnList, setAlreadyOnList] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const [referredBy, setReferredBy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleWaitlistSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formName,
          email: formEmail,
          website: formWebsite,
          referred_by: referredBy,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setSubmitError(t.waitlist.rateLimited);
        return;
      }
      if (!res.ok) throw new Error("Request failed");
      setPendingConfirm(Boolean(data?.pendingConfirmation));
      setAlreadyOnList(Boolean(data?.duplicate) || Boolean(data?.alreadyConfirmed));
      setReferralCode(typeof data?.referralCode === "string" ? data.referralCode : null);
      setSubmitted(true);
    } catch {
      setSubmitError(t.waitlist.genericError);
    } finally {
      setSubmitting(false);
    }
  };

  // Pick up ?ref=CODE from the URL — the referred-by code the visitor
  // came in with. Stored in state so we can echo a "invited by a friend"
  // banner and pass it to the waitlist submit.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = new URLSearchParams(window.location.search).get("ref");
    if (raw && /^[A-Z0-9]{6,16}$/i.test(raw)) setReferredBy(raw.toUpperCase());
  }, []);

  // Click-to-explain interactions
  const [modal, setModal] = useState<ModalContent | null>(null);
  const [expandedTimeline, setExpandedTimeline] = useState<number | null>(null);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);

  useEffect(() => {
    if (!modal) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setModal(null); };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [modal]);

  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": "https://www.assistantx.pl#org",
        name: "AssistantX",
        url: "https://www.assistantx.pl",
        logo: "https://www.assistantx.pl/icon-512.png",
      },
      {
        "@type": "WebSite",
        "@id": "https://www.assistantx.pl#website",
        url: "https://www.assistantx.pl",
        name: "AssistantX",
        description:
          "AssistantX is your AI assistant — a workspace for chat, uploads, integrations, cloud-synced projects, creation, and editing.",
        publisher: { "@id": "https://www.assistantx.pl#org" },
      },
      {
        "@type": "SoftwareApplication",
        name: "AssistantX",
        applicationCategory: "ProductivityApplication",
        operatingSystem: "Web, Windows, macOS, Linux",
        offers: { "@type": "Offer", price: "0", priceCurrency: "EUR" },
      },
    ],
  };

  return (
    // overflow-x-clip, NOT -hidden: `hidden` turns this into a scroll
    // container, which silently makes position:sticky inert for every
    // descendant — including the laptop tour. `clip` clips identically
    // without creating the scroll container.
    <div className="relative min-h-screen bg-[#050508] text-white overflow-x-clip">
      <LanguageSwitcher lang={lang} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      {/* Animated background mesh */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: "radial-gradient(ellipse 80% 50% at 55% 35%, rgba(120,80,220,0.15), transparent)",
          }}
        />
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(ellipse 60% 40% at 70% 60%, rgba(0,180,255,0.1), transparent)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      </div>

      {/* CSS animations for hero entrance */}
      <style>{`
        @keyframes hero-fade-up { from { opacity: 0; transform: translateY(30px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes hero-scale-in { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
        @keyframes hero-bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(8px); } }
        .hero-logo { animation: hero-scale-in 1s cubic-bezier(0.25,0.46,0.45,0.94) both; }
        .hero-title { animation: hero-fade-up 1s cubic-bezier(0.25,0.46,0.45,0.94) 0.2s both; }
        .hero-subtitle { animation: hero-fade-up 0.8s cubic-bezier(0.25,0.46,0.45,0.94) 0.5s both; }
        .hero-cta { animation: hero-fade-up 0.8s cubic-bezier(0.25,0.46,0.45,0.94) 0.7s both; }
        .hero-scroll { animation: hero-fade-up 0.8s cubic-bezier(0.25,0.46,0.45,0.94) 1.5s both; }
        .hero-scroll-bounce { animation: hero-bounce 2s ease-in-out infinite; }
        @keyframes section-fade-up {
          from { opacity: 0; transform: translateY(30px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .section-reveal {
          animation: section-fade-up 0.8s cubic-bezier(0.25,0.46,0.45,0.94) both;
        }
        @keyframes modal-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modal-card-in {
          from { opacity: 0; transform: translateY(24px) scale(0.96); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .modal-backdrop { animation: modal-backdrop-in 0.25s ease both; }
        .modal-card { animation: modal-card-in 0.35s cubic-bezier(0.25,0.46,0.45,0.94) both; }
        @keyframes detail-enter {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .timeline-detail-enter { animation: detail-enter 0.3s ease both; }
      `}</style>

      {/* ═══════════════ HERO ═══════════════ */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 overflow-hidden">
        {/* Cinematic backdrop */}
        <Image
          src="/media/hero-bg.png"
          alt=""
          aria-hidden="true"
          fill
          priority
          sizes="100vw"
          className="object-cover opacity-40 pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050508]/60 via-transparent to-[#050508] pointer-events-none" />
        <GlowOrb className="w-[800px] h-[800px] -top-40 left-1/2 -translate-x-1/2 opacity-20" color="rgba(120,80,220,0.4)" />
        <GlowOrb className="w-[600px] h-[600px] top-1/3 -right-40 opacity-15" color="rgba(0,180,255,0.3)" />
        <GlowOrb className="w-[500px] h-[500px] bottom-20 -left-40 opacity-10" color="rgba(255,100,200,0.2)" />

        {/* Logo */}
        <div className="mb-8 hero-logo">
          <div className="relative">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-600 via-purple-600 to-blue-600 flex items-center justify-center shadow-2xl shadow-purple-500/20">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/jarvis-logo.svg" alt="AssistantX logo" className="w-12 h-12" />
            </div>
            <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-violet-600 to-blue-600 opacity-20 blur-xl" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-center hero-title">
          <span className="block text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-[-0.04em] leading-[0.9]">
            <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">{t.hero.titleTop}</span>
          </span>
          <span className="block text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-[-0.04em] leading-[0.9] mt-2">
            <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">{t.hero.titleBottom}</span>
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-8 text-lg sm:text-xl text-white/50 max-w-2xl text-center leading-relaxed hero-subtitle">
          {t.hero.subtitle}
        </p>

        {/* CTA Buttons */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 hero-cta">
          <a
            href="#waitlist"
            className="group relative px-8 py-4 rounded-full text-sm font-semibold overflow-hidden transition-transform hover:scale-105 active:scale-95"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600" />
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute inset-0 shadow-[0_0_40px_rgba(120,80,220,0.4)]" />
            <span className="relative z-10">{t.hero.joinCta}</span>
          </a>
          <a
            href="#showcase"
            className="px-8 py-4 rounded-full text-sm font-semibold border border-white/10 bg-white/[0.03] backdrop-blur-sm hover:border-white/20 hover:bg-white/[0.06] transition-all"
          >
            {t.hero.demoCta}
          </a>
        </div>

        {launchDate && <LaunchCountdown targetIso={launchDate} lang={lang} />}

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 hero-scroll">
          <div className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-1.5 hero-scroll-bounce">
            <div className="w-1.5 h-2.5 rounded-full bg-white/40" />
          </div>
        </div>
      </section>

      {/* âââââââââââââââ AI SHOWCASE â scroll-driven laptop tour âââââââââââââââ */}
      {/* Keeps the #showcase id (hero's secondary CTA links to it) and the
          same heading strings.  The old 11-card grid is replaced by the tour;
          clicking a callout still opens the SHOWCASE_DETAILS modal via
          TOUR_TO_SHOWCASE. */}
      <div id="showcase">
        <LaptopTour
          t={t}
          onOpenStage={(stage) => {
            const title = TOUR_TO_SHOWCASE[stage.id];
            const item = SHOWCASE_ITEMS.find((s) => s.title === title);
            setModal({
              title: stage.title,
              subtitle: stage.subtitle,
              body: (title && SHOWCASE_DETAILS[title]?.body) || stage.subtitle,
              bullets: title ? SHOWCASE_DETAILS[title]?.bullets : undefined,
              gradient: item?.gradient ?? "from-violet-500 to-cyan-500",
              icon: item?.icon,
            });
          }}
        />
      </div>

      {/* ═══════════════ DEMO VIDEOS ═══════════════ */}
      <section className="relative py-32 px-6" style={{ contentVisibility: "auto", containIntrinsicSize: "900px" }}>
        <GlowOrb className="w-[600px] h-[600px] top-0 left-1/4 opacity-10" color="rgba(120,80,220,0.3)" />
        <AnimatedSection className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.03em]">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">{t.demos.heading}</span>
          </h2>
          <p className="mt-4 text-white/40 text-lg max-w-xl mx-auto">{t.demos.subtitle}</p>
        </AnimatedSection>

        <div className="max-w-5xl mx-auto grid gap-8 md:grid-cols-2">
          {[
            { title: "Voice Command Demo", image: "/media/demo-voice.png" },
            { title: "Desktop Automation", image: "/media/demo-automation.png" },
            { title: "Multi-Agent Research", image: "/media/demo-agents.png" },
            { title: "Code Generation", image: "/media/demo-code.png" },
          ].map((demo, i) => (
            <AnimatedSection key={demo.title} delay={i * 0.1}>
              <div
                role="button"
                tabIndex={0}
                aria-label={`Play demo: ${demo.title}`}
                onClick={() => setModal({
                  title: demo.title,
                  subtitle: t.demos.filmSubtitle,
                  body: t.demos.filmBody,
                  bullets: t.demos.filmBullets,
                  gradient: "from-violet-500 to-blue-500",
                })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
                className="group relative aspect-video rounded-2xl border border-white/[0.06] overflow-hidden hover:border-white/[0.12] transition-all cursor-pointer active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-2 focus-visible:ring-offset-[#050508]"
              >
                <Image
                  src={demo.image}
                  alt={demo.title}
                  fill
                  sizes="(min-width: 768px) 50vw, 100vw"
                  loading="lazy"
                  className="object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform">
                    <div className="w-0 h-0 border-l-[12px] border-l-white/80 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent ml-1" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-sm font-semibold">{demo.title}</p>
                  <p className="text-xs text-white/40 mt-1">{t.demos.comingSoon}</p>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* ═══════════════ FEATURE TIMELINE ═══════════════ */}
      <section className="relative py-32 px-6" style={{ contentVisibility: "auto", containIntrinsicSize: "1400px" }}>
        <AnimatedSection className="text-center mb-20">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.03em]">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">{t.timelineHeading}</span>
          </h2>
        </AnimatedSection>

        <div className="max-w-3xl mx-auto relative">
          {/* Timeline line */}
          <div className="absolute left-6 top-0 bottom-0 w-px bg-gradient-to-b from-violet-500/50 via-blue-500/50 to-cyan-500/50" />

          {TIMELINE_ITEMS.map((item, i) => (
            <AnimatedSection key={item.label} delay={i * 0.05} className="relative pl-16 pb-10 last:pb-0">
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expandedTimeline === i}
                aria-label={`${expandedTimeline === i ? "Collapse" : "Expand"} ${item.label}`}
                onClick={() => setExpandedTimeline(expandedTimeline === i ? null : i)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedTimeline(expandedTimeline === i ? null : i); } }}
                className="group cursor-pointer -m-2 p-2 rounded-xl hover:bg-white/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400"
              >
                <div className={`absolute left-4 top-1 w-4 h-4 rounded-full border-2 bg-[#050508] transition-colors ${expandedTimeline === i ? "border-cyan-400" : "border-violet-400/60"}`}>
                  <div className={`absolute inset-1 rounded-full transition-colors ${expandedTimeline === i ? "bg-cyan-400/70" : "bg-violet-400/40"}`} />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="text-lg font-bold tracking-tight">{item.label}</h3>
                  <svg
                    className={`w-3.5 h-3.5 text-white/30 group-hover:text-white/60 transition-all ${expandedTimeline === i ? "rotate-90 text-cyan-400/80" : ""}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                </div>
                <p className="text-sm text-white/40 mt-1">{item.desc}</p>
                {expandedTimeline === i && (
                  <p className="text-sm text-cyan-100/60 mt-3 pl-3 border-l-2 border-cyan-400/40 leading-relaxed timeline-detail-enter">
                    {item.detail}
                  </p>
                )}
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* ═══════════════ WHY ASSISTANTX ═══════════════ */}
      <section className="relative py-32 px-6" style={{ contentVisibility: "auto", containIntrinsicSize: "1200px" }}>
        <GlowOrb className="w-[700px] h-[700px] top-1/4 right-0 opacity-10" color="rgba(0,180,255,0.2)" />
        <AnimatedSection className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.03em]">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">{t.comparison.heading}</span>
          </h2>
          <p className="mt-4 text-white/40 text-lg max-w-xl mx-auto">{t.comparison.subheading}</p>
        </AnimatedSection>

        <div className="max-w-2xl mx-auto">
          <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-3 px-8 py-5 border-b border-white/[0.06]">
              <span className="text-sm text-white/40 font-medium">{t.comparison.feature}</span>
              <span className="text-sm font-bold text-center bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">{t.comparison.jarvisCol}</span>
              <span className="text-sm text-white/30 text-center">{t.comparison.chatbotCol}</span>
            </div>
            {/* Rows */}
            {COMPARISON.map((row, i) => (
              <AnimatedSection key={row.feature} delay={i * 0.03}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setExpandedRow(expandedRow === i ? null : i)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedRow(expandedRow === i ? null : i); } }}
                  className="border-b border-white/[0.03] last:border-b-0 hover:bg-white/[0.02] transition-colors cursor-pointer"
                >
                  <div className="grid grid-cols-3 px-8 py-4">
                    <span className={`text-sm transition-colors flex items-center gap-2 ${expandedRow === i ? "text-white" : "text-white/60"}`}>
                      <svg
                        className={`w-3 h-3 shrink-0 text-white/25 transition-transform ${expandedRow === i ? "rotate-90 text-violet-300" : ""}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                      </svg>
                      {row.feature}
                    </span>
                    <span className="text-center text-lg">
                      <span className="inline-flex w-6 h-6 rounded-full bg-emerald-500/20 items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                      </span>
                    </span>
                    <span className="text-center text-lg">
                      <span className="inline-flex w-6 h-6 rounded-full bg-red-500/10 items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-red-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </span>
                    </span>
                  </div>
                  {expandedRow === i && (
                    <div className="px-8 pb-4 timeline-detail-enter">
                      <p className="text-sm text-violet-100/60 pl-5 border-l-2 border-violet-400/40 leading-relaxed">{row.why}</p>
                    </div>
                  )}
                </div>
              </AnimatedSection>
            ))}
          </div>
        </div>
      </section>

      {/* ═══════════════ WAITLIST ═══════════════ */}
      <section id="waitlist" className="relative py-32 px-6">
        <GlowOrb className="w-[800px] h-[800px] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-15" color="rgba(120,80,220,0.3)" />

        <AnimatedSection className="text-center mb-12">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.03em]">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">{t.waitlist.heading}</span>
          </h2>
          <p className="mt-4 text-white/40 text-lg max-w-xl mx-auto">{t.waitlist.subheading}</p>
        </AnimatedSection>

        <AnimatedSection delay={0.2}>
          <div className="max-w-md mx-auto">
            <div className="rounded-3xl border border-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-8 shadow-2xl shadow-purple-500/5">
              {submitted ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h3 className="text-xl font-bold">
                    {alreadyOnList
                      ? t.waitlist.successAlready
                      : pendingConfirm
                        ? t.waitlist.successPending
                        : t.waitlist.successOn}
                  </h3>
                  <p className="text-sm text-white/40 mt-2">
                    {alreadyOnList
                      ? t.waitlist.successAlreadyBody
                      : pendingConfirm
                        ? t.waitlist.successPendingBody
                        : t.waitlist.successOnBody}
                  </p>

                  {referralCode && (
                    <div className="mt-8 rounded-2xl border border-violet-400/25 bg-violet-500/[0.06] p-5 text-left">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300/80">
                        🚀 {t.waitlist.referralTitle}
                      </p>
                      <p className="mt-2 text-xs text-white/60 leading-relaxed">
                        {t.waitlist.referralBody}
                      </p>
                      {(() => {
                        const origin =
                          typeof window !== "undefined" ? window.location.origin : "https://assistantx.pl";
                        const link = `${origin}/?ref=${referralCode}`;
                        return (
                          <div className="mt-3 flex items-center gap-2 rounded-xl border border-white/10 bg-black/40 p-2">
                            <input
                              readOnly
                              value={link}
                              className="flex-1 min-w-0 bg-transparent px-2 text-xs text-white/80 font-mono focus:outline-none"
                              onFocus={(e) => e.currentTarget.select()}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(link).then(() => {
                                  setCopied(true);
                                  setTimeout(() => setCopied(false), 1600);
                                });
                              }}
                              className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold text-white transition bg-gradient-to-r from-violet-600 to-blue-600 hover:opacity-90"
                            >
                              {copied ? t.waitlist.copied : t.waitlist.copy}
                            </button>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="space-y-4">
                  {referredBy && (
                    <div className="rounded-xl border border-violet-400/25 bg-violet-500/[0.06] px-3 py-2 text-[11px] text-violet-100/80 text-center">
                      {t.waitlist.referredByBanner}
                    </div>
                  )}
                  {/* Honeypot: hidden from humans, bots fill it → silently rejected. */}
                  <input
                    type="text"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={formWebsite}
                    onChange={(e) => setFormWebsite(e.target.value)}
                    aria-hidden="true"
                    style={{ position: "absolute", left: "-9999px", width: 1, height: 1, opacity: 0 }}
                  />
                  <div>
                    <input
                      type="text"
                      placeholder={t.waitlist.namePh}
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                      className="w-full px-5 py-3.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      placeholder={t.waitlist.emailPh}
                      value={formEmail}
                      onChange={(e) => setFormEmail(e.target.value)}
                      required
                      className="w-full px-5 py-3.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="group relative w-full py-4 rounded-xl text-sm font-semibold overflow-hidden transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 disabled:pointer-events-none"
                  >
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600" />
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
                    <div className="absolute inset-0 shadow-[0_0_60px_rgba(120,80,220,0.4)] group-hover:shadow-[0_0_80px_rgba(120,80,220,0.6)] transition-shadow" />
                    <span className="relative z-10">{submitting ? t.waitlist.joining : t.waitlist.join}</span>
                  </button>
                  {submitError && (
                    <p className="text-xs text-red-400/80 text-center">{submitError}</p>
                  )}
                  <p className="text-[11px] text-white/25 text-center leading-relaxed">
                    {t.waitlist.disclaimer}
                  </p>
                </form>
              )}

              {/* Live counter */}
              <div className="mt-6 pt-5 border-t border-white/[0.06] text-center">
                <div className="inline-flex items-center gap-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
                  </span>
                  <span className="text-sm text-white/50">
                    <span className="font-bold text-white/80">{waitlistCount.toLocaleString()}</span> {t.waitlist.peopleWaiting}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* ═══════════════ COMMUNITY ═══════════════ */}
      <section className="relative py-24 px-6" style={{ contentVisibility: "auto", containIntrinsicSize: "700px" }}>
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em]">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">{t.community.heading}</span>
          </h2>
        </AnimatedSection>

        <div className="max-w-2xl mx-auto grid gap-4 sm:grid-cols-3">
          {[
            {
              label: t.community.discord.label,
              desc: t.community.discord.desc,
              href: "https://discord.gg/mpjHw5QD",
              gradient: "from-indigo-500 to-violet-500",
              icon: (
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              ),
            },
            {
              label: t.community.docs.label,
              desc: t.community.docs.desc,
              href: "#",
              gradient: "from-blue-500 to-cyan-500",
              icon: (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              ),
            },
            {
              label: t.community.roadmap.label,
              desc: t.community.roadmap.desc,
              href: "/roadmap",
              gradient: "from-violet-500 to-fuchsia-500",
              icon: (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498 4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 0 0-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0Z" />
                </svg>
              ),
            },
          ].map((item, i) => (
            <AnimatedSection key={item.label} delay={i * 0.1}>
              <a
                href={item.href}
                target={item.href.startsWith("http") ? "_blank" : undefined}
                rel={item.href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="block rounded-2xl border border-white/[0.06] bg-white/[0.02] p-6 text-center hover:border-white/[0.14] hover:bg-white/[0.04] hover:-translate-y-0.5 transition-all group"
              >
                <span className={`inline-flex w-10 h-10 rounded-xl bg-gradient-to-br ${item.gradient} items-center justify-center mb-3 ring-1 ring-white/20 ring-inset opacity-90 group-hover:opacity-100 group-hover:scale-110 transition-all`}>
                  {item.icon}
                </span>
                <h3 className="font-bold text-sm tracking-tight group-hover:text-violet-300 transition-colors">{item.label}</h3>
                <p className="text-xs text-white/30 mt-1">{item.desc}</p>
              </a>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* ═══════════════ EXPLAINER MODAL ═══════════════ */}
      {modal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-6"
          onClick={() => setModal(null)}
        >
          <div className="absolute inset-0 bg-black/70 backdrop-blur-md modal-backdrop" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={modal.title}
            onClick={(e) => e.stopPropagation()}
            className="relative max-w-lg w-full rounded-3xl border border-white/[0.1] bg-[#0a0a12] p-8 shadow-2xl shadow-purple-500/10 modal-card max-h-[85vh] overflow-y-auto"
          >
            <button
              onClick={() => setModal(null)}
              aria-label={t.modal.close}
              className="absolute top-5 right-5 w-9 h-9 rounded-full border border-white/10 bg-white/[0.04] flex items-center justify-center text-white/50 hover:text-white hover:border-white/25 transition-all active:scale-90"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>

            <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${modal.gradient} flex items-center justify-center mb-6 ring-1 ring-white/20 ring-inset`}>
              {modal.icon ? (
                <svg className="w-7 h-7 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d={modal.icon} />
                </svg>
              ) : (
                <div className="w-0 h-0 border-l-[14px] border-l-white border-t-[8px] border-t-transparent border-b-[8px] border-b-transparent ml-1" />
              )}
            </div>

            <h3 className="text-2xl font-black tracking-tight">{modal.title}</h3>
            {modal.subtitle && <p className="text-sm text-white/40 mt-1">{modal.subtitle}</p>}
            <p className="text-[15px] text-white/70 leading-relaxed mt-5">{modal.body}</p>

            {modal.bullets && (
              <ul className="mt-6 space-y-3">
                {modal.bullets.map((b) => (
                  <li key={b} className="flex items-start gap-3 text-sm text-white/60">
                    <span className={`mt-0.5 inline-flex w-5 h-5 shrink-0 rounded-full bg-gradient-to-br ${modal.gradient} opacity-80 items-center justify-center`}>
                      <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                    </span>
                    {b}
                  </li>
                ))}
              </ul>
            )}

            <a
              href="#waitlist"
              onClick={() => setModal(null)}
              className="mt-8 inline-flex items-center gap-2 text-sm font-semibold text-violet-300 hover:text-violet-200 transition-colors"
            >
              {t.modal.getAccess}
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </a>
          </div>
        </div>
      )}

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="relative border-t border-white/[0.05] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/jarvis-logo.svg" alt="" className="w-5 h-5" />
            </div>
            <span className="text-sm text-white/40">AssistantX</span>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
            <a
              href="/faq"
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              {t.footer.faq}
            </a>
            <a
              href="/privacy"
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              {t.footer.privacy}
            </a>
            <a
              href="/terms"
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              {t.footer.terms}
            </a>
            <a
              href="/contact"
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              {t.footer.contact}
            </a>
          </nav>

          <div className="text-xs text-white/30 text-center sm:text-right">
            &copy; {new Date().getFullYear()} AssistantX. {t.footer.rights}
          </div>
        </div>
      </footer>
    </div>
  );
}
