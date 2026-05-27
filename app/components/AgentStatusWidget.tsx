"use client";

export type AgentName =
  | "architect"
  | "coder"
  | "tester"
  | "sandbox"
  | "reviewer"
  | "critic"
  | "security"
  | "ruflo_queen_planning"
  | "ruflo_worker_execution"
  | "ruflo_memory_sync"
  | "ruflo_synthesis";

type AgentStatusWidgetProps = {
  activeAgent: AgentName | null;
  dark: boolean;
  message?: string;
  score?: number | null;
  attempt?: number;
  quotaRemaining?: number | null;
  quotaMax?: number | null;
  tokenEstimateK?: number | null;
};

const AGENTS: Array<{ id: AgentName; label: string; icon: string }> = [
  { id: "architect", label: "Architect", icon: "🕵️" },
  { id: "coder",     label: "Coder",     icon: "💻" },
  { id: "tester",    label: "Tester",    icon: "🧪" },
  { id: "sandbox",   label: "Sandbox",   icon: "📦" },
  { id: "reviewer",  label: "Reviewer",  icon: "🔍" },
  { id: "critic",    label: "Critic",    icon: "⚖️" },
  { id: "security",  label: "Security",  icon: "🛡️" },
  { id: "ruflo_queen_planning", label: "Ruflo Queen", icon: "👑" },
  { id: "ruflo_worker_execution", label: "Ruflo Workers", icon: "🤖" },
  { id: "ruflo_memory_sync", label: "Ruflo Memory", icon: "🧠" },
  { id: "ruflo_synthesis", label: "Ruflo Synthesis", icon: "🧩" },
];

export function AgentStatusWidget({
  activeAgent,
  dark,
  message,
  score,
  attempt,
  quotaRemaining,
  quotaMax,
  tokenEstimateK,
}: AgentStatusWidgetProps) {
  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {AGENTS.map((agent) => {
          const isActive = activeAgent === agent.id;
          return (
            <div
              key={agent.id}
              className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-all ${
                isActive
                  ? dark
                    ? "border-sky-500 bg-sky-900/40 text-sky-200 ring-1 ring-sky-500/60 animate-pulse"
                    : "border-sky-500 bg-sky-50 text-sky-700 ring-1 ring-sky-400/60 animate-pulse"
                  : dark
                    ? "border-slate-700 bg-slate-900/40 text-slate-500"
                    : "border-slate-200 bg-slate-50 text-slate-400"
              }`}
            >
              <span>{agent.icon}</span>
              <span>{agent.label}</span>
            </div>
          );
        })}
      </div>
      {message && (
        <p className={`text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}>
          {message}
        </p>
      )}
      {attempt && attempt > 1 ? (
        <div className={`inline-flex rounded-lg border px-2 py-1 text-[11px] ${dark ? "border-amber-700/60 bg-amber-900/30 text-amber-200" : "border-amber-300 bg-amber-50 text-amber-700"}`}>
          [Attempt {attempt} of 3]
        </div>
      ) : null}
      {score != null ? (
        <div className={`inline-flex rounded-lg border px-2 py-1 text-[11px] font-semibold ${score >= 8 ? (dark ? "border-emerald-700/60 bg-emerald-900/30 text-emerald-200" : "border-emerald-300 bg-emerald-50 text-emerald-700") : (dark ? "border-amber-700/60 bg-amber-900/30 text-amber-200" : "border-amber-300 bg-amber-50 text-amber-700")}`}>
          {score >= 8 ? "⭐" : "⚠️"} {score}/10
        </div>
      ) : null}
      {(tokenEstimateK != null || (quotaRemaining != null && quotaMax != null)) ? (
        <div className={`space-y-1 rounded-lg border px-2.5 py-2 text-[11px] ${dark ? "border-slate-700 bg-slate-900/40 text-slate-300" : "border-slate-200 bg-slate-50 text-slate-600"}`}>
          {tokenEstimateK != null ? (
            <p>📊 Cloud resources: ~{Math.round(tokenEstimateK * 1000).toLocaleString()} tokens</p>
          ) : null}
          {quotaRemaining != null && quotaMax != null ? (
            <p>🔋 Remaining cloud uses today: {quotaRemaining} / {quotaMax}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
