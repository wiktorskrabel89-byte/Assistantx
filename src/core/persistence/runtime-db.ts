/**
 * Runtime DB Persistence — Phase 1 + Phase 2 Foundation
 *
 * Thin helpers that write runtime execution records to Supabase.  All writes
 * are best-effort for audit/observability tables (fail-open) and fail-closed
 * for authoritative state tables (workflow_runs, tool_calls).
 *
 * Every helper returns void or throws — callers should catch and continue for
 * observability-only writes; propagate for authoritative state writes.
 */

import { randomUUID } from "node:crypto";
import type { RuntimeAgentRole } from "@/src/agents/runtime/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types mirroring DB schema columns
// ─────────────────────────────────────────────────────────────────────────────

export type WorkflowRunStatus =
  | "queued" | "running" | "waiting_for_approval"
  | "completed" | "failed" | "cancelled" | "retrying" | "expired";

export type WorkflowRunRow = {
  execution_id: string;
  workflow_id: string;
  user_id: string | null;
  organization_id: string | null;
  status: WorkflowRunStatus;
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

export type ApprovalRequestRow = {
  id: string;
  execution_id: string;
  tool_id?: string | null;
  workflow_id?: string | null;
  requested_by: string;
  organization_id?: string | null;
  reason: string;
  context: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired";
  expires_at?: string | null;
};

export type AgentTaskRow = {
  task_id: string;
  execution_id: string;
  role: RuntimeAgentRole;
  goal: string;
  input: Record<string, unknown>;
  user_id?: string | null;
  organization_id?: string | null;
  status: WorkflowRunStatus;
  output?: Record<string, unknown> | null;
  error?: string | null;
  completed_at?: string | null;
};

export type CostRecordRow = {
  user_id: string;
  organization_id?: string | null;
  execution_id?: string | null;
  workflow_id?: string | null;
  tool_id?: string | null;
  lane: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_usd: number;
};

export type McpServerRegistrationRow = {
  id: string;
  name: string;
  url: string;
  trust_level: "trusted" | "verified" | "sandboxed";
  capabilities: Record<string, unknown>[];
  credential_ref?: string | null;
  organization_id?: string | null;
  enabled: boolean;
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

// ─────────────────────────────────────────────────────────────────────────────
// Approval requests (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a new approval request.
 */
export async function insertApprovalRequest(row: ApprovalRequestRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("approval_requests").insert({
    id: row.id,
    execution_id: row.execution_id,
    tool_id: row.tool_id ?? null,
    workflow_id: row.workflow_id ?? null,
    requested_by: row.requested_by,
    organization_id: row.organization_id ?? null,
    reason: row.reason,
    context: row.context,
    status: row.status,
    expires_at: row.expires_at ?? null,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`insertApprovalRequest: ${error.message}`);
}

/**
 * Update approval request status and optional resolution fields.
 */
export async function updateApprovalRequest(
  approvalId: string,
  status: "approved" | "rejected" | "expired",
  resolvedBy?: string,
  note?: string,
): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("approval_requests")
    .update({
      status,
      resolved_by: resolvedBy ?? null,
      resolution_note: note ?? null,
      resolved_at: new Date().toISOString(),
    })
    .eq("id", approvalId);

  if (error) throw new Error(`updateApprovalRequest: ${error.message}`);
}

/**
 * List pending approvals for an organization.
 */
export async function listPendingApprovals(
  organizationId: string,
): Promise<ApprovalRequestRow[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("approval_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "pending")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`listPendingApprovals: ${error.message}`);
  return (data ?? []) as ApprovalRequestRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Agent tasks (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a new agent task record.
 */
export async function insertAgentTask(row: AgentTaskRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("agent_tasks").insert({
    task_id: row.task_id,
    execution_id: row.execution_id,
    role: row.role,
    goal: row.goal,
    input: row.input,
    user_id: row.user_id ?? null,
    organization_id: row.organization_id ?? null,
    status: row.status,
    output: row.output ?? null,
    error: row.error ?? null,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`insertAgentTask: ${error.message}`);
}

/**
 * Update agent task result.
 */
export async function updateAgentTask(
  taskId: string,
  patch: {
    status: WorkflowRunStatus;
    output?: Record<string, unknown> | null;
    error?: string | null;
    completed_at?: string | null;
  },
): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("agent_tasks")
    .update(patch)
    .eq("task_id", taskId);

  if (error) throw new Error(`updateAgentTask: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Cost records (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Persist a cost record.  Best-effort — callers should catch errors.
 */
export async function insertCostRecord(row: CostRecordRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("cost_records").insert({
    id: randomUUID(),
    ...row,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`insertCostRecord: ${error.message}`);
}

/**
 * Sum cost (USD) for a user within an optional date range.
 */
export async function sumCostForUser(
  userId: string,
  since?: Date,
): Promise<number> {
  const supabase = await getClient();
  let query = supabase
    .from("cost_records")
    .select("estimated_usd")
    .eq("user_id", userId);

  if (since) {
    query = query.gte("created_at", since.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(`sumCostForUser: ${error.message}`);
  return (data ?? []).reduce(
    (sum: number, r: { estimated_usd: number }) => sum + r.estimated_usd,
    0,
  );
}

/**
 * Sum cost (USD) for an organization within an optional date range.
 */
export async function sumCostForOrg(
  organizationId: string,
  since?: Date,
): Promise<number> {
  const supabase = await getClient();
  let query = supabase
    .from("cost_records")
    .select("estimated_usd")
    .eq("organization_id", organizationId);

  if (since) {
    query = query.gte("created_at", since.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(`sumCostForOrg: ${error.message}`);
  return (data ?? []).reduce(
    (sum: number, r: { estimated_usd: number }) => sum + r.estimated_usd,
    0,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP server registrations (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertMcpServerRegistration(
  row: McpServerRegistrationRow,
): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("mcp_server_registrations").upsert(
    {
      id: row.id,
      name: row.name,
      url: row.url,
      trust_level: row.trust_level,
      capabilities: row.capabilities,
      credential_ref: row.credential_ref ?? null,
      organization_id: row.organization_id ?? null,
      enabled: row.enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" },
  );

  if (error) throw new Error(`upsertMcpServerRegistration: ${error.message}`);
}

export async function getMcpServerRegistration(
  id: string,
): Promise<McpServerRegistrationRow | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("mcp_server_registrations")
    .select("id, name, url, trust_level, capabilities, credential_ref, organization_id, enabled")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`getMcpServerRegistration: ${error.message}`);
  return (data as McpServerRegistrationRow | null) ?? null;
}

export async function listMcpServerRegistrations(
  organizationId?: string | null,
): Promise<McpServerRegistrationRow[]> {
  const supabase = await getClient();
  let query = supabase
    .from("mcp_server_registrations")
    .select("id, name, url, trust_level, capabilities, credential_ref, organization_id, enabled")
    .eq("enabled", true);

  if (organizationId === null) {
    query = query.is("organization_id", null);
  } else if (organizationId) {
    query = query.or(`organization_id.eq.${organizationId},organization_id.is.null`);
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`listMcpServerRegistrations: ${error.message}`);
  return (data ?? []) as McpServerRegistrationRow[];
}

export async function setMcpServerEnabled(id: string, enabled: boolean): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("mcp_server_registrations")
    .update({ enabled, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw new Error(`setMcpServerEnabled: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Explicit permissions (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

export async function hasExplicitPermission(params: {
  userId: string;
  permission: string;
  organizationId?: string | null;
  resourceType?: string;
  resourceId?: string;
}): Promise<boolean> {
  const supabase = await getClient();
  let query = supabase
    .from("permissions")
    .select("id, expires_at")
    .eq("user_id", params.userId)
    .eq("permission", params.permission)
    .limit(25);

  if (params.organizationId === null) {
    query = query.is("organization_id", null);
  } else if (params.organizationId) {
    query = query.or(`organization_id.eq.${params.organizationId},organization_id.is.null`);
  }

  if (params.resourceType) {
    query = query.eq("resource_type", params.resourceType);
  }

  if (params.resourceId) {
    query = query.eq("resource_id", params.resourceId);
  }

  const { data, error } = await query;
  if (error) throw new Error(`hasExplicitPermission: ${error.message}`);

  const now = Date.now();
  return (data ?? []).some((row: { expires_at?: string | null }) => {
    if (!row.expires_at) return true;
    return new Date(row.expires_at).getTime() > now;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Persistent rate limit entries (Phase 3)
// ─────────────────────────────────────────────────────────────────────────────

export async function consumeRateLimitEntry(params: {
  key: string;
  limit: number;
  windowMs: number;
}): Promise<{ allowed: boolean; retryAfterMs: number }> {
  const supabase = await getClient();
  const now = Date.now();
  const nowIso = new Date(now).toISOString();
  const windowEndIso = new Date(now + params.windowMs).toISOString();

  const { data, error } = await supabase
    .from("rate_limit_entries")
    .select("key, count, window_end")
    .eq("key", params.key)
    .maybeSingle();

  if (error) throw new Error(`consumeRateLimitEntry(select): ${error.message}`);

  if (!data || new Date(data.window_end).getTime() <= now) {
    const { error: upsertError } = await supabase.from("rate_limit_entries").upsert(
      {
        key: params.key,
        count: 1,
        window_start: nowIso,
        window_end: windowEndIso,
      },
      { onConflict: "key" },
    );
    if (upsertError) throw new Error(`consumeRateLimitEntry(upsert): ${upsertError.message}`);
    return { allowed: true, retryAfterMs: 0 };
  }

  const currentCount = Number(data.count ?? 0);
  const windowEndTs = new Date(data.window_end).getTime();

  if (currentCount >= params.limit) {
    return {
      allowed: false,
      retryAfterMs: Math.max(windowEndTs - now, 0),
    };
  }

  const { error: updateError } = await supabase
    .from("rate_limit_entries")
    .update({ count: currentCount + 1 })
    .eq("key", params.key);

  if (updateError) throw new Error(`consumeRateLimitEntry(update): ${updateError.message}`);
  return { allowed: true, retryAfterMs: 0 };
}
