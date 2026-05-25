// Public API v1 shared contracts
// These types are the canonical contracts exposed to external consumers.

export type ApiV1WorkflowRequest = {
  workflow: string;
  input: Record<string, unknown>;
  /** Optional organization scope for multi-tenant execution. */
  organizationId?: string;
};

export type ApiV1WorkflowResponse = {
  executionId: string;
  status: "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled" | "retrying" | "expired";
  output?: Record<string, unknown>;
  error?: string;
};

export type ApiV1RunSummary = {
  executionId: string;
  workflowId: string;
  status: string;
  createdAt: string;
  completedAt?: string;
  orchestrator?: "inngest" | "ruflo" | "unknown";
  runPhase?: string;
};

export type ApiV1MemorySearchRequest = {
  query: string;
  layer?: "short_term" | "episodic" | "semantic" | "procedural";
  limit?: number;
};

export type ApiV1MemorySearchResponse = {
  entries: Array<{ id: string; content: string; score: number; layer: string }>;
  totalFound: number;
};

export type ApiV1ToolInvokeRequest = {
  toolId: string;
  input: Record<string, unknown>;
  /** Optional organization scope. */
  organizationId?: string;
  /**
   * Caller-provided idempotency key.  When supplied, a repeated request with
   * the same key returns the cached result without re-executing the tool.
   */
  idempotencyKey?: string;
};

export type ApiV1ToolInvokeResponse = {
  ok: boolean;
  toolId: string;
  output?: Record<string, unknown>;
  error?: string;
};

export type ApiV1Error = {
  error: string;
  code?: string;
};
