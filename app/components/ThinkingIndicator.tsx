"use client";

/**
 * ThinkingIndicator — compact "agent is thinking" pill rendered inline with
 * the chat thread. Previously embedded the standalone AgentStatusWidget,
 * which has been removed per Meridian design rule 8 ("No standalone Agent
 * Activity panel — agent state lives inside Task Activity card only").
 *
 * Multi-agent status is now surfaced as a single line (agent label + status
 * dot + short message) so the chat thread stays focused on the conversation.
 * The richer agent-state UI lives inside MeridianActivityPanel → Aktywność
 * zadań — wired in Step 6 once the activity-panel data feed lands.
 */

import { type AgentName, AGENT_LABEL } from "../lib/agent-types";

type ThinkingIndicatorProps = {
  dark: boolean;
  visible: boolean;
  status?: string;
  routeReason?: string;
  /** Approximate length (in characters) of the partial response being streamed. */
  partialResponseLength?: number;
  /** When set, renders the active pipeline agent inline. */
  multiAgentStatus?: {
    agent: AgentName;
    message: string;
    score?: number | null;
    attempt?: number;
    quotaRemaining?: number | null;
    quotaMax?: number | null;
    tokenEstimateK?: number | null;
  } | null;
};

export function ThinkingIndicator({
  dark,
  visible,
  status,
  routeReason,
  partialResponseLength,
  multiAgentStatus,
}: ThinkingIndicatorProps) {
  if (!visible) return null;

  const tokenEstimate = partialResponseLength ? Math.ceil(partialResponseLength / 4) : 0;

  return (
    <div
      className={`mt-3 rounded-2xl border px-4 py-3 ${dark ? "border-slate-800 bg-slate-900 text-slate-200" : "border-slate-200 bg-white text-slate-700"}`}
    >
      <div className="flex items-center gap-3 text-sm font-medium">
        <span className="inline-flex gap-1">
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_infinite] rounded-full bg-blue-500" />
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_0.2s_infinite] rounded-full bg-cyan-500" />
          <span className="h-2 w-2 animate-[pulse_0.9s_ease-in-out_0.4s_infinite] rounded-full bg-violet-500" />
        </span>
        <span>{status ?? "Thinking through the next response..."}</span>
        {tokenEstimate > 0 && (
          <span className={`ml-auto text-xs font-normal ${dark ? "text-slate-500" : "text-slate-400"}`}>
            ~{tokenEstimate.toLocaleString()} tokens
          </span>
        )}
      </div>
      {routeReason ? <div className="mt-2 text-xs text-slate-500">{routeReason}</div> : null}
      {multiAgentStatus ? (
        <div
          className={`mt-2 flex items-center gap-2 text-xs ${dark ? "text-slate-400" : "text-slate-500"}`}
        >
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--ox-cyan, #00f0ff)" }}
          />
          <span style={{ color: "var(--ox-cyan, #00f0ff)", fontWeight: 600 }}>
            {AGENT_LABEL[multiAgentStatus.agent] ?? multiAgentStatus.agent}
          </span>
          <span>·</span>
          <span className="truncate">{multiAgentStatus.message}</span>
          {multiAgentStatus.attempt !== undefined ? <span>· próba {multiAgentStatus.attempt}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
