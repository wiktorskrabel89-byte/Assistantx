"use client";

export type AgentName = "architect" | "coder" | "tester" | "security";

type AgentStatusWidgetProps = {
  activeAgent: AgentName | null;
  dark: boolean;
  message?: string;
};

const AGENTS: Array<{ id: AgentName; label: string; icon: string }> = [
  { id: "architect", label: "Architect", icon: "🕵️" },
  { id: "coder",     label: "Coder",     icon: "💻" },
  { id: "tester",    label: "Tester",    icon: "🧪" },
  { id: "security",  label: "Security",  icon: "🛡️" },
];

export function AgentStatusWidget({ activeAgent, dark, message }: AgentStatusWidgetProps) {
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
    </div>
  );
}
