import { ArrowRight, CheckCircle2, Layers3, Milestone, Radar, ShieldCheck } from "lucide-react";
import {
  MASTER_ROADMAP_ARCHITECTURE,
  MASTER_ROADMAP_EPICS,
  MASTER_ROADMAP_GATES,
  MASTER_ROADMAP_MILESTONES,
  type RoadmapMilestoneStatus,
} from "@/app/lib/master-roadmap";

const STATUS_LABELS: Record<RoadmapMilestoneStatus, string> = {
  current: "Current foundation",
  next: "Next milestone",
  planned: "Planned",
};

const STATUS_STYLES: Record<RoadmapMilestoneStatus, string> = {
  current: "border-emerald-300/60 bg-emerald-100 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
  next: "border-sky-300/60 bg-sky-100 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  planned: "border-slate-300/60 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200",
};

export function RoadmapPanel({ dark }: { dark: boolean }) {
  const shellClass = dark
    ? "border-slate-800 bg-slate-950/70 text-slate-100"
    : "border-slate-200 bg-white/90 text-slate-900";
  const cardClass = dark
    ? "border-slate-800 bg-slate-900/60"
    : "border-slate-200 bg-slate-50/80";
  const mutedClass = dark ? "text-slate-300" : "text-slate-600";
  const subtleClass = dark ? "text-slate-400" : "text-slate-500";

  return (
    <section className={`rounded-3xl border p-6 backdrop-blur sm:p-8 ${shellClass}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-violet-700 dark:text-violet-200">
            <Layers3 className="h-3.5 w-3.5" />
            Master roadmap
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight">AssistantX product direction</h2>
          <p className={`mt-2 max-w-3xl text-sm leading-7 ${mutedClass}`}>
            This roadmap keeps the whole stack aligned: Electron as the power-user runtime, web as the thin client,
            and Supabase plus local runtime working as one hybrid system.
          </p>
        </div>
        <div className={`rounded-2xl border px-4 py-3 text-sm ${cardClass}`}>
          <div className="font-semibold">Execution model</div>
          <div className={`mt-1 max-w-xs text-xs leading-6 ${subtleClass}`}>
            One master roadmap drives sequencing, while dedicated epics turn each area into backlog-ready work.
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        {MASTER_ROADMAP_ARCHITECTURE.pillars.map((pillar) => (
          <article key={pillar.label} className={`rounded-2xl border p-4 ${cardClass}`}>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-500">{pillar.label}</div>
            <p className={`mt-2 text-sm leading-6 ${mutedClass}`}>{pillar.detail}</p>
          </article>
        ))}
      </div>

      <div className="mt-8">
        <div className="flex items-center gap-2">
          <Milestone className="h-4 w-4 text-sky-500" />
          <h3 className="text-lg font-semibold">Milestones M0 → M5</h3>
        </div>
        <div className="mt-4 grid gap-4">
          {MASTER_ROADMAP_MILESTONES.map((milestone, index) => (
            <article key={milestone.id} className={`rounded-2xl border p-5 ${cardClass}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-sky-500">{milestone.id}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                    <h4 className="text-base font-semibold">{milestone.title}</h4>
                  </div>
                  <p className={`mt-2 text-sm leading-6 ${mutedClass}`}>{milestone.summary}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${STATUS_STYLES[milestone.status]}`}>
                  {STATUS_LABELS[milestone.status]}
                </span>
              </div>

              <ul className={`mt-4 space-y-2 text-sm ${mutedClass}`}>
                {milestone.outcomes.map((outcome) => (
                  <li key={outcome} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />
                    <span>{outcome}</span>
                  </li>
                ))}
              </ul>

              {milestone.dependencies?.length ? (
                <div className={`mt-4 text-xs ${subtleClass}`}>
                  Depends on: {milestone.dependencies.join(", ")}
                </div>
              ) : null}

              {index < MASTER_ROADMAP_MILESTONES.length - 1 ? (
                <div className="mt-4 h-px w-full bg-gradient-to-r from-sky-500/30 via-transparent to-transparent" />
              ) : null}
            </article>
          ))}
        </div>
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <article className={`rounded-2xl border p-5 ${cardClass}`}>
          <div className="flex items-center gap-2">
            <Radar className="h-4 w-4 text-sky-500" />
            <h3 className="text-lg font-semibold">Technical epics</h3>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {MASTER_ROADMAP_EPICS.map((epic) => (
              <div key={epic.id} className={`rounded-2xl border p-4 ${dark ? "border-slate-800 bg-slate-950/70" : "border-slate-200 bg-white"}`}>
                <div className="text-sm font-semibold">{epic.title}</div>
                <p className={`mt-2 text-xs leading-6 ${mutedClass}`}>{epic.summary}</p>
              </div>
            ))}
          </div>
        </article>

        <article className={`rounded-2xl border p-5 ${cardClass}`}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-sky-500" />
            <h3 className="text-lg font-semibold">Release gates</h3>
          </div>
          <ul className={`mt-4 space-y-3 text-sm leading-6 ${mutedClass}`}>
            {MASTER_ROADMAP_GATES.map((gate) => (
              <li key={gate} className="flex items-start gap-2">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-500" />
                <span>{gate}</span>
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  );
}
