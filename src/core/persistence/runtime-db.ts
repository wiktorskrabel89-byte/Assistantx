/**
 * Runtime DB Persistence — Phase 1 Foundation Hardening
 *
 * Thin helpers that write runtime execution records to Supabase.  All writes
 * are best-effort for audit/observability tables (fail-open) and fail-closed
 * for authoritative state tables (workflow_runs, tool_calls).
 *
 * Every helper returns void or throws — callers should catch and continue for
 * observability-only writes; propagate for authoritative state writes.
 */

import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Types mirroring DB schema columns
// ─────────────────────────────────────────────────────────────────────────────

export type WorkflowRunRow = {
  execution_id: string;
  workflow_id: string;
  user_id: string | null;
  organization_id: string | null;
  status: "queued" | "running" | "waiting_for_approval" | "completed" | "failed" | "cancelled" | "retrying" | "expired";
  trigger: string;
  input: Record<string, unknown>;
  output?: Record<string, unknown> | null;
  error?: string | null;
  cost_usd?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
  created_at?: string;
};

export type ToolCallRow = {
  execution_id: string;
  tool_id: string;
  user_id: string | null;
  organization_id: string | null;
  policy_allowed: boolean;
  risk_level: "low" | "medium" | "high" | "critical";
  input_summary?: string | null;
  output_summary?: string | null;
  error?: string | null;
  duration_ms?: number | null;
};

export type AuditLogRow = {
  event_type: string;
  user_id: string | null;
  organization_id: string | null;
  execution_id?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  payload: Record<string, unknown>;
};

export type RuntimeEventRow = {
  event_type: string;
  user_id?: string | null;
  organization_id?: string | null;
  execution_id?: string | null;
  payload: Record<string, unknown>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Client factory (lazy, avoids importing server client in edge bundles)
// ─────────────────────────────────────────────────────────────────────────────

async function getClient() {
  const { createClient } = await import("@/lib/server");
  return createClient();
}

// ─────────────────────────────────────────────────────────────────────────────
// Workflow runs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a new workflow run record (status = 'queued').
 * Returns the generated DB row id.
 */
export async function insertWorkflowRun(row: WorkflowRunRow): Promise<string> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("workflow_runs")
    .insert({
      ...row,
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw new Error(`insertWorkflowRun: ${error.message}`);
  return (data as { id: string }).id;
}

/**
 * Update workflow run status and optional output/error.
 */
export async function updateWorkflowRun(
  executionId: string,
  patch: {
    status: WorkflowRunRow["status"];
    output?: Record<string, unknown> | null;
    error?: string | null;
    cost_usd?: number | null;
    started_at?: string | null;
    completed_at?: string | null;
  },
): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("workflow_runs")
    .update(patch)
    .eq("execution_id", executionId);

  if (error) throw new Error(`updateWorkflowRun: ${error.message}`);
}

/**
 * List workflow runs for a user (and optionally an org), newest first.
 */
export async function listWorkflowRuns(params: {
  userId: string;
  organizationId?: string | null;
  status?: WorkflowRunRow["status"];
  limit?: number;
}): Promise<WorkflowRunRow[]> {
  const supabase = await getClient();
  let query = supabase
    .from("workflow_runs")
    .select("execution_id, workflow_id, user_id, organization_id, status, input, output, error, cost_usd, started_at, completed_at, created_at")
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 50);

  if (params.organizationId) {
    query = query.eq("organization_id", params.organizationId);
  } else {
    query = query.eq("user_id", params.userId);
  }

  if (params.status) {
    query = query.eq("status", params.status);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listWorkflowRuns: ${error.message}`);
  return (data ?? []) as WorkflowRunRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool calls
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Record a tool invocation.  Best-effort — callers should catch errors.
 */
export async function insertToolCall(row: ToolCallRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("tool_calls").insert({
    ...row,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`insertToolCall: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Audit logs
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Append an audit log entry.  Best-effort — callers should catch errors.
 */
export async function insertAuditLog(row: AuditLogRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("audit_logs").insert({
    ...row,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`insertAuditLog: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime events ledger
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a runtime event to the replayable events ledger.
 * Best-effort — callers should catch errors.
 */
export async function persistRuntimeEvent(row: RuntimeEventRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("runtime_events").insert({
    id: randomUUID(),
    ...row,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`persistRuntimeEvent: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Idempotency helpers (uses execution_checkpoints table from new migration)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check if an idempotency key has already been processed.
 * Returns the stored result if it has; null otherwise.
 */
export async function checkIdempotencyKey(
  key: string,
): Promise<Record<string, unknown> | null> {
  const supabase = await getClient();
  const { data } = await supabase
    .from("execution_checkpoints")
    .select("result")
    .eq("idempotency_key", key)
    .maybeSingle();

  if (!data) return null;
  return (data as { result: Record<string, unknown> }).result ?? null;
}

/**
 * Store the result of a completed idempotent operation.
 */
export async function storeIdempotencyResult(
  key: string,
  executionId: string,
  result: Record<string, unknown>,
  userId?: string | null,
): Promise<void> {
  const supabase = await getClient();
  await supabase.from("execution_checkpoints").upsert(
    {
      idempotency_key: key,
      execution_id: executionId,
      user_id: userId ?? null,
      result,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    },
    { onConflict: "idempotency_key" },
  );
}
