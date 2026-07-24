"use client";

import { useRef, useState, useEffect } from "react";
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

export default function PublicHome() {
  const containerRef = useRef<HTMLDivElement>(null);

  const [waitlistCount] = useState(128431);
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formWebsite, setFormWebsite] = useState(""); // honeypot — stays empty
  const [submitted, setSubmitted] = useState(false);
  const [alreadyOnList, setAlreadyOnList] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(false);
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
        body: JSON.stringify({ name: formName, email: formEmail, website: formWebsite }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 429) {
        setSubmitError("Too many signups from your network — please try again in a little while.");
        return;
      }
      if (!res.ok) throw new Error("Request failed");
      setPendingConfirm(Boolean(data?.pendingConfirmation));
      setAlreadyOnList(Boolean(data?.duplicate) || Boolean(data?.alreadyConfirmed));
      setSubmitted(true);
    } catch {
      setSubmitError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      setMousePos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
    };
    window.addEventListener("mousemove", handler);
    return () => window.removeEventListener("mousemove", handler);
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

  return (
    <div ref={containerRef} className="relative min-h-screen bg-[#050508] text-white overflow-x-hidden">
      {/* Animated background mesh */}
      <div className="fixed inset-0 pointer-events-none">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background: `radial-gradient(ellipse 80% 50% at ${50 + mousePos.x * 10}% ${30 + mousePos.y * 10}%, rgba(120,80,220,0.15), transparent)`,
            transition: "background 0.3s ease",
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/media/hero-bg.png"
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#050508]/60 via-transparent to-[#050508] pointer-events-none" />
        <GlowOrb className="w-[800px] h-[800px] -top-40 left-1/2 -translate-x-1/2 opacity-20" color="rgba(120,80,220,0.4)" />
        <GlowOrb className="w-[600px] h-[600px] top-1/3 -right-40 opacity-15" color="rgba(0,180,255,0.3)" />
        <GlowOrb className="w-[500px] h-[500px] bottom-20 -left-40 opacity-10" color="rgba(255,100,200,0.2)" />

        {/* Logo */}
        <div className="mb-8 hero-logo">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-white flex items-center justify-center shadow-2xl shadow-purple-500/20 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assistantx-logo.svg" alt="AssistantX logo" className="w-20 h-20" />
            </div>
            <div className="absolute -inset-1 rounded-full bg-gradient-to-br from-violet-600 to-blue-600 opacity-20 blur-xl" />
          </div>
        </div>

        {/* Title */}
        <h1 className="text-center hero-title">
          <span className="block text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-[-0.04em] leading-[0.9]">
            <span className="bg-gradient-to-r from-white via-white to-white/60 bg-clip-text text-transparent">The AI</span>
          </span>
          <span className="block text-6xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-[-0.04em] leading-[0.9] mt-2">
            <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">Operating System.</span>
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-8 text-lg sm:text-xl text-white/50 max-w-2xl text-center leading-relaxed hero-subtitle">
          AssistantX-Jarvis is the intelligence layer between you and your entire digital life.
          It thinks, acts, learns, and evolves.
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
            <span className="relative z-10">Join Waitlist</span>
          </a>
          <a
            href="#showcase"
            className="px-8 py-4 rounded-full text-sm font-semibold border border-white/10 bg-white/[0.03] backdrop-blur-sm hover:border-white/20 hover:bg-white/[0.06] transition-all"
          >
            Watch Demo
          </a>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 hero-scroll">
          <div className="w-6 h-10 rounded-full border-2 border-white/20 flex items-start justify-center p-1.5 hero-scroll-bounce">
            <div className="w-1.5 h-2.5 rounded-full bg-white/40" />
          </div>
        </div>
      </section>

      {/* ═══════════════ AI SHOWCASE ═══════════════ */}
      <section id="showcase" className="relative py-32 px-6">
        <AnimatedSection className="text-center mb-24">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.03em]">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">
              Not a chatbot.
            </span>
            <br />
            <span className="bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">
              An operating system.
            </span>
          </h2>
        </AnimatedSection>

        <div className="max-w-6xl mx-auto grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SHOWCASE_ITEMS.map((item, i) => (
            <AnimatedSection key={item.title} delay={i * 0.05}>
              <div
                role="button"
                tabIndex={0}
                onClick={() => setModal({
                  title: item.title,
                  subtitle: item.subtitle,
                  body: SHOWCASE_DETAILS[item.title]?.body ?? item.subtitle,
                  bullets: SHOWCASE_DETAILS[item.title]?.bullets,
                  gradient: item.gradient,
                  icon: item.icon,
                })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
                className="group relative h-full rounded-3xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-8 overflow-hidden hover:border-white/[0.14] transition-all duration-500 hover:-translate-y-1 cursor-pointer active:scale-[0.98]"
              >
                <div className={`absolute -top-20 -right-20 w-40 h-40 rounded-full bg-gradient-to-br ${item.gradient} opacity-0 group-hover:opacity-15 blur-3xl transition-opacity duration-700`} />
                <div
                  className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-6 ring-1 ring-white/20 ring-inset group-hover:scale-110 transition-transform duration-500`}
                  style={{ boxShadow: `0 8px 32px ${item.glow}` }}
                >
                  <svg className="w-7 h-7 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                  </svg>
                </div>
                <h3 className="text-xl font-bold tracking-tight mb-2">{item.title}</h3>
                <p className="text-sm text-white/40 leading-relaxed">{item.subtitle}</p>
                <span className="absolute bottom-6 right-6 text-white/20 group-hover:text-white/60 transition-colors text-xs font-medium flex items-center gap-1">
                  Learn more
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </span>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* ═══════════════ DEMO VIDEOS ═══════════════ */}
      <section className="relative py-32 px-6">
        <GlowOrb className="w-[600px] h-[600px] top-0 left-1/4 opacity-10" color="rgba(120,80,220,0.3)" />
        <AnimatedSection className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.03em]">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">See it in action.</span>
          </h2>
          <p className="mt-4 text-white/40 text-lg max-w-xl mx-auto">Real demonstrations of what Jarvis can do.</p>
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
                onClick={() => setModal({
                  title: demo.title,
                  subtitle: "Demo film",
                  body: "This demo film is in production. Join the waitlist and you'll be the first to see Jarvis in action — real tasks, real screen, no cuts.",
                  bullets: ["Recorded on real hardware, unscripted", "Narrated walkthrough of every step", "Premieres to waitlist members first"],
                  gradient: "from-violet-500 to-blue-500",
                })}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); (e.currentTarget as HTMLElement).click(); } }}
                className="group relative aspect-video rounded-2xl border border-white/[0.06] overflow-hidden hover:border-white/[0.12] transition-all cursor-pointer active:scale-[0.99]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={demo.image}
                  alt={demo.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-700"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-black/30 backdrop-blur-sm flex items-center justify-center border border-white/20 group-hover:scale-110 transition-transform">
                    <div className="w-0 h-0 border-l-[12px] border-l-white/80 border-t-[7px] border-t-transparent border-b-[7px] border-b-transparent ml-1" />
                  </div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-5 bg-gradient-to-t from-black/80 to-transparent">
                  <p className="text-sm font-semibold">{demo.title}</p>
                  <p className="text-xs text-white/40 mt-1">Coming soon</p>
                </div>
              </div>
            </AnimatedSection>
          ))}
        </div>
      </section>

      {/* ═══════════════ FEATURE TIMELINE ═══════════════ */}
      <section className="relative py-32 px-6">
        <AnimatedSection className="text-center mb-20">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.03em]">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">The full stack of intelligence.</span>
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
                onClick={() => setExpandedTimeline(expandedTimeline === i ? null : i)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpandedTimeline(expandedTimeline === i ? null : i); } }}
                className="group cursor-pointer -m-2 p-2 rounded-xl hover:bg-white/[0.03] transition-colors"
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
      <section className="relative py-32 px-6">
        <GlowOrb className="w-[700px] h-[700px] top-1/4 right-0 opacity-10" color="rgba(0,180,255,0.2)" />
        <AnimatedSection className="text-center mb-16">
          <h2 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-[-0.03em]">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Beyond chatbots.</span>
          </h2>
          <p className="mt-4 text-white/40 text-lg max-w-xl mx-auto">AssistantX-Jarvis is not another AI chatbot. It is an AI Operating System.</p>
        </AnimatedSection>

        <div className="max-w-2xl mx-auto">
          <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden">
            {/* Header */}
            <div className="grid grid-cols-3 px-8 py-5 border-b border-white/[0.06]">
              <span className="text-sm text-white/40 font-medium">Feature</span>
              <span className="text-sm font-bold text-center bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">Jarvis</span>
              <span className="text-sm text-white/30 text-center">AI Chatbots</span>
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
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Be first in line.</span>
          </h2>
          <p className="mt-4 text-white/40 text-lg max-w-xl mx-auto">Join the waitlist and get early access to the future of computing.</p>
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
                      ? "You're already on the list!"
                      : pendingConfirm
                        ? "Check your email 📬"
                        : "You're on the list!"}
                  </h3>
                  <p className="text-sm text-white/40 mt-2">
                    {alreadyOnList
                      ? "This email is already registered — no need to sign up twice."
                      : pendingConfirm
                        ? "We sent you a confirmation link. Click it to lock in your spot — check spam if you don't see it."
                        : "We'll notify you when Jarvis is ready."}
                  </p>
                </div>
              ) : (
                <form onSubmit={handleWaitlistSubmit} className="space-y-4">
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
                      placeholder="Your name"
                      value={formName}
                      onChange={(e) => setFormName(e.target.value)}
                      required
                      className="w-full px-5 py-3.5 rounded-xl bg-white/[0.05] border border-white/[0.08] text-sm placeholder:text-white/25 focus:outline-none focus:border-violet-500/50 focus:ring-1 focus:ring-violet-500/20 transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      placeholder="your@email.com"
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
                    <span className="relative z-10">{submitting ? "Joining…" : "Join Waitlist"}</span>
                  </button>
                  {submitError && (
                    <p className="text-xs text-red-400/80 text-center">{submitError}</p>
                  )}
                  <p className="text-[11px] text-white/25 text-center leading-relaxed">
                    When you join, your first name (e.g. &quot;Anna K.&quot;) is announced in our Discord community.
                    Your email is never shown anywhere.
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
                    <span className="font-bold text-white/80">{waitlistCount.toLocaleString()}</span> people waiting
                  </span>
                </div>
              </div>
            </div>
          </div>
        </AnimatedSection>
      </section>

      {/* ═══════════════ COMMUNITY ═══════════════ */}
      <section className="relative py-24 px-6">
        <AnimatedSection className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em]">
            <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Join the community.</span>
          </h2>
        </AnimatedSection>

        <div className="max-w-2xl mx-auto grid gap-4 sm:grid-cols-3">
          {[
            {
              label: "Discord",
              desc: "Chat with builders",
              href: "https://discord.gg/mpjHw5QD",
              gradient: "from-indigo-500 to-violet-500",
              icon: (
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M20.317 4.37a19.79 19.79 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
                </svg>
              ),
            },
            {
              label: "Documentation",
              desc: "Learn how it works",
              href: "#",
              gradient: "from-blue-500 to-cyan-500",
              icon: (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                </svg>
              ),
            },
            {
              label: "Roadmap",
              desc: "See what's next",
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
              aria-label="Close"
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
              Get early access
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
            </a>
          </div>
        </div>
      )}

      {/* ═══════════════ FOOTER ═══════════════ */}
      <footer className="relative border-t border-white/[0.05] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/assistantx-logo.svg" alt="" className="w-8 h-8" />
            </div>
            <span className="text-sm text-white/40">AssistantX</span>
          </div>

          <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs">
            <a
              href="/privacy"
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              Privacy Policy
            </a>
            <a
              href="/terms"
              className="text-white/40 hover:text-white/80 transition-colors"
            >
              Terms of Service
            </a>
          </nav>

          <div className="text-xs text-white/30 text-center sm:text-right">
            &copy; {new Date().getFullYear()} AssistantX by Acrux.pl Sp. z o.o. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
