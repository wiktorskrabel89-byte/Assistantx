import Link from "next/link";

export const metadata = {
  title: "Roadmap",
  description: "The AssistantX-Jarvis public roadmap — from voice-first MVP to a full AI Operating System.",
};

const PHASES = [
  {
    tag: "v0.5",
    status: "in-progress" as const,
    title: "The Foundation",
    subtitle: "Voice-first MVP",
    items: [
      "Wake-word voice activation — 10-stage pipeline with noise suppression and voice matching",
      "Natural conversation — local & cloud model routing",
      "Persistent memory — conversation, long-term and project memory",
      "Projects, Blueprints & intelligent requirements",
      "Basic review pipeline — every action verified before execution",
      "Desktop app for Windows with guided setup wizard",
    ],
  },
  {
    tag: "v1.0",
    status: "next" as const,
    title: "The Intelligence Layer",
    subtitle: "17 core reasoning systems",
    items: [
      "AI Constitution — immutable safety rules injected into every decision",
      "Simulation Engine — outcomes simulated before risky actions run",
      "Trust Engine — agents earn autonomy through proven reliability",
      "Skill Evolution — abilities version, improve and roll back like code",
      "Failure & Success Analysis — Jarvis learns from every outcome",
      "Devil's Advocate & Reality Check — decisions challenged before execution",
      "Executive Decision Engine — weighted multi-system reasoning",
    ],
  },
  {
    tag: "v2.0",
    status: "planned" as const,
    title: "The Operating System",
    subtitle: "Multi-agent orchestration",
    items: [
      "Multi-Agent System — specialist agents working in parallel",
      "Deep Research — autonomous multi-source investigation",
      "World Model — predictive understanding of your digital environment",
      "Knowledge-gap detection — Jarvis knows what it doesn't know",
      "Goal decomposition — long-horizon missions broken into verified steps",
      "Cross-device intelligence — one brain, every screen",
    ],
  },
];

const STATUS_STYLES = {
  "in-progress": { label: "In progress", dot: "bg-emerald-400", text: "text-emerald-400", border: "border-emerald-400/30", bg: "bg-emerald-400/10" },
  next: { label: "Up next", dot: "bg-violet-400", text: "text-violet-400", border: "border-violet-400/30", bg: "bg-violet-400/10" },
  planned: { label: "Planned", dot: "bg-blue-400", text: "text-blue-400", border: "border-blue-400/30", bg: "bg-blue-400/10" },
};

export default function RoadmapPage() {
  return (
    <main className="relative min-h-screen bg-[#050508] text-white overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute inset-0 opacity-30" style={{ background: "radial-gradient(ellipse 80% 50% at 50% 0%, rgba(120,80,220,0.15), transparent)" }} />
        <div className="absolute inset-0 opacity-20" style={{ background: "radial-gradient(ellipse 60% 40% at 70% 60%, rgba(0,180,255,0.1), transparent)" }} />
        <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
      </div>

      {/* Header */}
      <header className="relative pt-24 pb-16 px-6 text-center">
        <Link href="/" className="inline-flex items-center gap-3 mb-10 opacity-80 hover:opacity-100 transition-opacity">
          <span className="relative inline-flex w-12 h-12 rounded-xl bg-gradient-to-br from-violet-600 via-purple-600 to-blue-600 items-center justify-center shadow-lg shadow-purple-500/20">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/jarvis-logo.svg" alt="AssistantX-Jarvis" className="w-7 h-7" />
          </span>
          <span className="text-sm font-semibold tracking-wide text-white/70">AssistantX-Jarvis</span>
        </Link>

        <h1 className="text-5xl sm:text-6xl md:text-7xl font-black tracking-[-0.04em] leading-[0.95]">
          <span className="bg-gradient-to-r from-white to-white/60 bg-clip-text text-transparent">The road to the</span>
          <br />
          <span className="bg-gradient-to-r from-violet-400 via-blue-400 to-cyan-400 bg-clip-text text-transparent">AI Operating System.</span>
        </h1>
        <p className="mt-6 text-lg text-white/40 max-w-xl mx-auto leading-relaxed">
          Every phase ships real capability. No vaporware — if it&apos;s not on this page, it&apos;s not being built yet.
        </p>
      </header>

      {/* Phases */}
      <section className="relative max-w-3xl mx-auto px-6 pb-32">
        {/* Vertical line */}
        <div className="absolute left-10 sm:left-12 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-500/40 via-violet-500/40 to-blue-500/30" />

        <div className="space-y-16">
          {PHASES.map((phase) => {
            const s = STATUS_STYLES[phase.status];
            return (
              <div key={phase.tag} className="relative pl-16 sm:pl-20">
                {/* Dot */}
                <div className={`absolute left-2 sm:left-4 top-2 w-8 h-8 rounded-full border ${s.border} ${s.bg} flex items-center justify-center backdrop-blur-sm`}>
                  <span className={`w-2.5 h-2.5 rounded-full ${s.dot}`} />
                </div>

                <div className="rounded-3xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-8 hover:border-white/[0.12] transition-all">
                  <div className="flex flex-wrap items-center gap-3 mb-4">
                    <span className="text-2xl font-black tracking-tight bg-gradient-to-r from-violet-400 to-cyan-400 bg-clip-text text-transparent">{phase.tag}</span>
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${s.border} ${s.bg} ${s.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${s.dot} ${phase.status === "in-progress" ? "animate-pulse" : ""}`} />
                      {s.label}
                    </span>
                  </div>

                  <h2 className="text-2xl font-bold tracking-tight">{phase.title}</h2>
                  <p className="text-sm text-white/40 mt-1 mb-6">{phase.subtitle}</p>

                  <ul className="space-y-3">
                    {phase.items.map((item) => (
                      <li key={item} className="flex items-start gap-3 text-sm text-white/60 leading-relaxed">
                        <svg className="w-4 h-4 mt-0.5 shrink-0 text-violet-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5-5 5M6 7l5 5-5 5" />
                        </svg>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="relative pb-32 px-6 text-center">
        <h2 className="text-3xl sm:text-4xl font-black tracking-[-0.03em] mb-8">
          <span className="bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Want to shape what&apos;s next?</span>
        </h2>
        <div className="flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/#waitlist"
            className="group relative px-8 py-4 rounded-full text-sm font-semibold overflow-hidden transition-transform hover:scale-105 active:scale-95 inline-block"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-violet-600 to-blue-600" />
            <span className="absolute inset-0 bg-gradient-to-r from-violet-500 to-blue-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="absolute inset-0 shadow-[0_0_40px_rgba(120,80,220,0.4)]" />
            <span className="relative z-10">Join Waitlist</span>
          </Link>
          <a
            href="https://discord.gg/mpjHw5QD"
            target="_blank"
            rel="noopener noreferrer"
            className="px-8 py-4 rounded-full text-sm font-semibold border border-white/10 bg-white/[0.03] backdrop-blur-sm hover:border-white/20 hover:bg-white/[0.06] transition-all inline-block"
          >
            Join Discord
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-white/[0.05] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <Link href="/" className="flex items-center gap-3">
            <span className="inline-flex w-8 h-8 rounded-lg bg-gradient-to-br from-violet-600 to-blue-600 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/jarvis-logo.svg" alt="" className="w-[18px] h-[18px]" />
            </span>
            <span className="text-sm text-white/40">AssistantX-Jarvis</span>
          </Link>
          <div className="text-xs text-white/20">
            &copy; {new Date().getFullYear()} Acrux.pl Sp. z o.o. All rights reserved.
          </div>
        </div>
      </footer>
    </main>
  );
}
