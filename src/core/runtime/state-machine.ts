/**
 * Runtime State Machine — Phase 1 Foundation Hardening
 *
 * Canonical state transition definitions for workflow runs, agent tasks, and
 * tool executions.  All runtime components must use these types instead of
 * bare string literals so invalid transitions are caught at compile time.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Canonical execution statuses
// ─────────────────────────────────────────────────────────────────────────────

export type RuntimeExecutionStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed"
  | "cancelled"
  | "retrying"
  | "expired";

export type RuntimeTransition = {
  from: RuntimeExecutionStatus;
  to: RuntimeExecutionStatus;
  trigger: string;
};

// ─────────────────────────────────────────────────────────────────────────────
// Allowed state transitions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Explicit allowlist of valid state transitions.
 *
 * Any transition NOT in this list must be rejected by the runtime to prevent
 * invalid lifecycle moves (e.g. re-queuing a completed run).
 */
export const ALLOWED_TRANSITIONS: RuntimeTransition[] = [
  { from: "queued", to: "running", trigger: "execution_started" },
  { from: "queued", to: "cancelled", trigger: "user_cancelled" },
  { from: "queued", to: "expired", trigger: "deadline_exceeded" },
  { from: "running", to: "waiting_for_approval", trigger: "approval_required" },
  { from: "running", to: "completed", trigger: "execution_finished" },
  { from: "running", to: "failed", trigger: "execution_error" },
  { from: "running", to: "retrying", trigger: "transient_error" },
  { from: "running", to: "cancelled", trigger: "user_cancelled" },
  { from: "running", to: "expired", trigger: "deadline_exceeded" },
  { from: "waiting_for_approval", to: "running", trigger: "approval_granted" },
  { from: "waiting_for_approval", to: "failed", trigger: "approval_rejected" },
  { from: "waiting_for_approval", to: "expired", trigger: "approval_timeout" },
  { from: "waiting_for_approval", to: "cancelled", trigger: "user_cancelled" },
  { from: "retrying", to: "running", trigger: "retry_started" },
  { from: "retrying", to: "failed", trigger: "retry_limit_exceeded" },
  { from: "retrying", to: "cancelled", trigger: "user_cancelled" },
];

/**
 * Returns true when the transition from `from` → `to` is valid.
 */
export function isTransitionAllowed(
  from: RuntimeExecutionStatus,
  to: RuntimeExecutionStatus,
): boolean {
  return ALLOWED_TRANSITIONS.some((t) => t.from === from && t.to === to);
}

/**
 * Returns the trigger name for a known transition, or null when no transition
 * exists between the two states.
 */
export function getTransitionTrigger(
  from: RuntimeExecutionStatus,
  to: RuntimeExecutionStatus,
): string | null {
  const transition = ALLOWED_TRANSITIONS.find(
    (t) => t.from === from && t.to === to,
  );
  return transition?.trigger ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Terminal and active states
// ─────────────────────────────────────────────────────────────────────────────

export const TERMINAL_STATUSES = new Set<RuntimeExecutionStatus>([
  "completed",
  "failed",
  "cancelled",
  "expired",
]);

export const ACTIVE_STATUSES = new Set<RuntimeExecutionStatus>([
  "queued",
  "running",
  "waiting_for_approval",
  "retrying",
]);

export function isTerminal(status: RuntimeExecutionStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function isActive(status: RuntimeExecutionStatus): boolean {
  return ACTIVE_STATUSES.has(status);
}

// ─────────────────────────────────────────────────────────────────────────────
// Retry classification
// ─────────────────────────────────────────────────────────────────────────────

export type RetryClass =
  | "transient_provider"    // 5xx from AI provider — safe to retry
  | "transient_network"     // timeout / connection error — safe to retry
  | "tool_failure"          // tool returned error — retry depends on idempotency
  | "policy_denied"         // policy check failed — do NOT retry automatically
  | "approval_blocked"      // waiting for human — state moves to waiting_for_approval
  | "fatal"                 // schema error, auth failure — do NOT retry

export type RetryConfig = {
  class: RetryClass;
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
};

export const DEFAULT_RETRY_CONFIGS: Record<RetryClass, RetryConfig> = {
  transient_provider: {
    class: "transient_provider",
    maxAttempts: 3,
    backoffMs: 1_000,
    backoffMultiplier: 2,
  },
  transient_network: {
    class: "transient_network",
    maxAttempts: 4,
    backoffMs: 500,
    backoffMultiplier: 2,
  },
  tool_failure: {
    class: "tool_failure",
    maxAttempts: 2,
    backoffMs: 2_000,
    backoffMultiplier: 1,
  },
  policy_denied: {
    class: "policy_denied",
    maxAttempts: 1,
    backoffMs: 0,
    backoffMultiplier: 1,
  },
  approval_blocked: {
    class: "approval_blocked",
    maxAttempts: 1,
    backoffMs: 0,
    backoffMultiplier: 1,
  },
  fatal: {
    class: "fatal",
    maxAttempts: 1,
    backoffMs: 0,
    backoffMultiplier: 1,
  },
};

export function classifyError(error: string): RetryClass {
  const lower = error.toLowerCase();
  if (lower.includes("5") && (lower.includes("provider") || lower.includes("upstream"))) {
    return "transient_provider";
  }
  if (lower.includes("timeout") || lower.includes("network") || lower.includes("econnreset")) {
    return "transient_network";
  }
  if (lower.includes("policy") || lower.includes("denied") || lower.includes("forbidden")) {
    return "policy_denied";
  }
  if (lower.includes("approval") || lower.includes("waiting")) {
    return "approval_blocked";
  }
  if (lower.includes("schema") || lower.includes("unauthorized") || lower.includes("invalid token")) {
    return "fatal";
  }
  return "tool_failure";
}
