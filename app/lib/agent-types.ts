/**
 * Shared agent identifier union — used by chat transport, thinking indicator,
 * and the Meridian activity panel. Extracted from the old AgentStatusWidget
 * (deleted per design rule 8 — agent state lives inside the Task Activity
 * card only, not a standalone panel).
 *
 * Code identifiers stay in English per design rule 9; user-facing labels are
 * Polish and live in app/components/meridian/agent-labels.ts.
 */

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

/** Polish display labels for each agent. Surfaced inline in Task Activity. */
export const AGENT_LABEL: Record<AgentName, string> = {
  architect: "Architekt",
  coder: "Programista",
  tester: "Tester",
  sandbox: "Sandbox",
  reviewer: "Recenzent",
  critic: "Krytyk",
  security: "Bezpieczeństwo",
  ruflo_queen_planning: "Ruflo · planowanie",
  ruflo_worker_execution: "Ruflo · wykonanie",
  ruflo_memory_sync: "Ruflo · pamięć",
  ruflo_synthesis: "Ruflo · synteza",
};
