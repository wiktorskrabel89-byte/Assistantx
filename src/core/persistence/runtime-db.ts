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

export type DeviceTrustState = "pending" | "trusted" | "revoked" | "compromised";
export type DevicePlatform = "android" | "desktop" | "web" | "server";
export type DeviceRole = "control" | "runtime" | "operator";

export type DeviceRow = {
  id?: string;
  user_id: string;
  organization_id?: string | null;
  platform: DevicePlatform;
  role: DeviceRole;
  label?: string | null;
  fingerprint_hash?: string | null;
  trust_state: DeviceTrustState;
  pair_code?: string | null;
  pair_code_expires_at?: string | null;
  trust_key_hash?: string | null;
  consent_profile?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  last_seen_at?: string | null;
  last_known_ipv6?: string | null;
  last_known_mac?: string | null;
  last_udp_port?: number | null;
  last_seen_network_epoch?: number | null;
  wake_method_last_success?: "tailscale_direct" | "udp_path_probe" | "ipv6_magic_packet" | "lan_broadcast" | null;
  wake_fail_count?: number | null;
};

export type DeviceSessionRow = {
  id?: string;
  device_id: string;
  user_id: string;
  organization_id?: string | null;
  session_token_hash: string;
  resume_token_hash?: string | null;
  status: "active" | "closed" | "expired" | "revoked";
  last_heartbeat_at?: string;
  ended_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type DevicePresenceRow = {
  device_id: string;
  user_id: string;
  organization_id?: string | null;
  status: "offline" | "booting" | "online" | "busy" | "gaming" | "sleeping" | "idle" | "hibernated" | "unreachable";
  active_apps?: string[];
  cpu_percent?: number | null;
  ram_percent?: number | null;
  network_mode?: "mesh_direct" | "relay" | "lan" | "unknown";
  is_online: boolean;
  last_heartbeat_at?: string;
};

export type NetworkPeerRow = {
  id?: string;
  device_id: string;
  user_id: string;
  organization_id?: string | null;
  provider: "tailscale" | "relay" | "lan" | "custom";
  node_id?: string | null;
  mesh_ip?: string | null;
  hostname?: string | null;
  mac_address?: string | null;
  direct_connected?: boolean;
  relay_connected?: boolean;
  eligible_for_wake?: boolean;
  metadata?: Record<string, unknown>;
};

export type DeviceWakeCandidateRow = {
  device_id: string;
  provider: string;
  mac_address: string | null;
  ipv6: string | null;
  udp_port: number | null;
  eligible_for_wake: boolean;
  last_seen_at: string | null;
};

export type RuntimeCapabilityRow = {
  id?: string;
  device_id: string;
  user_id: string;
  organization_id?: string | null;
  capability_key: string;
  enabled: boolean;
  requires_consent?: boolean;
  consent_version?: number;
  consented_at?: string | null;
  metadata?: Record<string, unknown>;
};

export type WorkflowCheckpointRow = {
  id?: string;
  execution_id: string;
  workflow_id: string;
  user_id?: string | null;
  organization_id?: string | null;
  step_key: string;
  status: WorkflowRunStatus;
  payload?: Record<string, unknown>;
  error?: string | null;
};

export type ApprovalPolicyRow = {
  id?: string;
  organization_id?: string | null;
  user_id?: string | null;
  device_id?: string | null;
  action_pattern: string;
  risk_level: "low" | "medium" | "high" | "critical";
  approval_mode: "per_action" | "workflow_token" | "pre_approved" | "deny";
  is_enabled: boolean;
  metadata?: Record<string, unknown>;
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
// Approvals (canonical table: approvals)
// ─────────────────────────────────────────────────────────────────────────────

async function resolveApprovalTableName(supabase: Awaited<ReturnType<typeof getClient>>) {
  try {
    const { error } = await supabase.from("approvals").select("id").limit(1);
    if (!error) return "approvals";
  } catch {
    // ignore
  }
  return "approval_requests";
}

/**
 * Persist a new approval request.
 */
export async function insertApprovalRequest(row: ApprovalRequestRow): Promise<void> {
  const supabase = await getClient();
  const table = await resolveApprovalTableName(supabase);
  const payload: Record<string, unknown> = table === "approvals" ? {
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
    requested_at: new Date().toISOString(),
  } : {
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
  };
  const { error } = await supabase.from(table).insert(payload as never);

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
  const table = await resolveApprovalTableName(supabase);
  const patch: Record<string, unknown> = table === "approvals" ? {
    status,
    resolved_by: resolvedBy ?? null,
    ...(note ? { reason: note } : {}),
    resolved_at: new Date().toISOString(),
  } : {
    status,
    resolved_by: resolvedBy ?? null,
    resolution_note: note ?? null,
    resolved_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from(table)
    .update(patch as never)
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
  const table = await resolveApprovalTableName(supabase);
  let query = supabase
    .from(table)
    .select("*")
    .eq("organization_id", organizationId)
    .eq("status", "pending");

  if (table === "approvals") {
    query = query.order("requested_at", { ascending: true });
  } else {
    query = query.order("created_at", { ascending: true });
  }
  const { data, error } = await query;

  if (error) throw new Error(`listPendingApprovals: ${error.message}`);
  return (data ?? []) as ApprovalRequestRow[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Devices / sessions / presence / capabilities / checkpoints (Sprint 1)
// ─────────────────────────────────────────────────────────────────────────────

export async function upsertDevice(row: DeviceRow): Promise<DeviceRow> {
  const supabase = await getClient();
  const payload = {
    id: row.id ?? randomUUID(),
    user_id: row.user_id,
    organization_id: row.organization_id ?? null,
    platform: row.platform,
    role: row.role,
    label: row.label ?? null,
    fingerprint_hash: row.fingerprint_hash ?? null,
    trust_state: row.trust_state,
    pair_code: row.pair_code ?? null,
    pair_code_expires_at: row.pair_code_expires_at ?? null,
    trust_key_hash: row.trust_key_hash ?? null,
    consent_profile: row.consent_profile ?? {},
    metadata: row.metadata ?? {},
    last_seen_at: row.last_seen_at ?? null,
    last_known_ipv6: row.last_known_ipv6 ?? null,
    last_known_mac: row.last_known_mac ?? null,
    last_udp_port: row.last_udp_port ?? null,
    last_seen_network_epoch: row.last_seen_network_epoch ?? null,
    wake_method_last_success: row.wake_method_last_success ?? null,
    wake_fail_count: row.wake_fail_count ?? 0,
    updated_at: new Date().toISOString(),
  };

  if (row.id) {
    const { data, error } = await supabase
      .from("devices")
      .upsert(payload, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(`upsertDevice: ${error.message}`);
    return data as DeviceRow;
  }

  const { data, error } = await supabase
    .from("devices")
    .insert(payload)
    .select("*")
    .single();
  if (!error) return data as DeviceRow;

  // Deduplicate by fingerprint when available.
  if (payload.fingerprint_hash) {
    const { data: existing, error: existingError } = await supabase
      .from("devices")
      .select("*")
      .eq("user_id", payload.user_id)
      .eq("fingerprint_hash", payload.fingerprint_hash)
      .maybeSingle();
    if (existingError) throw new Error(`upsertDevice(existing): ${existingError.message}`);
    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from("devices")
        .update({
          platform: payload.platform,
          role: payload.role,
          label: payload.label,
          trust_state: payload.trust_state,
          pair_code: payload.pair_code,
          pair_code_expires_at: payload.pair_code_expires_at,
          trust_key_hash: payload.trust_key_hash,
          consent_profile: payload.consent_profile,
          metadata: payload.metadata,
          last_seen_at: payload.last_seen_at,
          last_known_ipv6: payload.last_known_ipv6,
          last_known_mac: payload.last_known_mac,
          last_udp_port: payload.last_udp_port,
          last_seen_network_epoch: payload.last_seen_network_epoch,
          wake_method_last_success: payload.wake_method_last_success,
          wake_fail_count: payload.wake_fail_count,
          updated_at: payload.updated_at,
        })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (updateError) throw new Error(`upsertDevice(update): ${updateError.message}`);
      return updated as DeviceRow;
    }
  }

  throw new Error(`upsertDevice: ${error.message}`);
}

export async function getDeviceById(deviceId: string): Promise<DeviceRow | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("devices")
    .select("*")
    .eq("id", deviceId)
    .maybeSingle();
  if (error) throw new Error(`getDeviceById: ${error.message}`);
  return (data as DeviceRow | null) ?? null;
}

export async function getDeviceByPairCode(params: {
  userId: string;
  pairCode: string;
}): Promise<DeviceRow | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("devices")
    .select("*")
    .eq("user_id", params.userId)
    .eq("pair_code", params.pairCode)
    .eq("trust_state", "pending")
    .maybeSingle();
  if (error) throw new Error(`getDeviceByPairCode: ${error.message}`);
  return (data as DeviceRow | null) ?? null;
}

export async function listDevicesForUser(params: {
  userId: string;
  organizationId?: string | null;
  trustState?: DeviceTrustState;
}): Promise<DeviceRow[]> {
  const supabase = await getClient();
  let query = supabase
    .from("devices")
    .select("*")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false });
  if (params.organizationId) {
    query = query.eq("organization_id", params.organizationId);
  }
  if (params.trustState) {
    query = query.eq("trust_state", params.trustState);
  }
  const { data, error } = await query;
  if (error) throw new Error(`listDevicesForUser: ${error.message}`);
  return (data ?? []) as DeviceRow[];
}

export async function updateDeviceTrust(params: {
  deviceId: string;
  trustState: DeviceTrustState;
  trustKeyHash?: string | null;
  pairCode?: string | null;
  pairCodeExpiresAt?: string | null;
  consentProfile?: Record<string, unknown>;
}): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("devices")
    .update({
      trust_state: params.trustState,
      trust_key_hash: params.trustKeyHash ?? undefined,
      pair_code: params.pairCode ?? undefined,
      pair_code_expires_at: params.pairCodeExpiresAt ?? undefined,
      consent_profile: params.consentProfile ?? undefined,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.deviceId);
  if (error) throw new Error(`updateDeviceTrust: ${error.message}`);
}

export async function insertDeviceSession(row: DeviceSessionRow): Promise<string> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("device_sessions")
    .insert({
      id: row.id ?? randomUUID(),
      device_id: row.device_id,
      user_id: row.user_id,
      organization_id: row.organization_id ?? null,
      session_token_hash: row.session_token_hash,
      resume_token_hash: row.resume_token_hash ?? null,
      status: row.status,
      last_heartbeat_at: row.last_heartbeat_at ?? new Date().toISOString(),
      ended_at: row.ended_at ?? null,
      metadata: row.metadata ?? {},
    })
    .select("id")
    .single();
  if (error) throw new Error(`insertDeviceSession: ${error.message}`);
  return (data as { id: string }).id;
}

export async function touchDeviceSession(sessionId: string): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("device_sessions")
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq("id", sessionId);
  if (error) throw new Error(`touchDeviceSession: ${error.message}`);
}

export async function closeDeviceSession(sessionId: string, status: "closed" | "expired" | "revoked"): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("device_sessions")
    .update({
      status,
      ended_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq("id", sessionId);
  if (error) throw new Error(`closeDeviceSession: ${error.message}`);
}

export async function upsertDevicePresence(row: DevicePresenceRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("device_presence")
    .upsert(
      {
        device_id: row.device_id,
        user_id: row.user_id,
        organization_id: row.organization_id ?? null,
        status: row.status,
        active_apps: row.active_apps ?? [],
        cpu_percent: row.cpu_percent ?? null,
        ram_percent: row.ram_percent ?? null,
        network_mode: row.network_mode ?? "unknown",
        is_online: row.is_online,
        last_heartbeat_at: row.last_heartbeat_at ?? new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id" },
    );
  if (error) throw new Error(`upsertDevicePresence: ${error.message}`);
}

export async function upsertNetworkPeer(row: NetworkPeerRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("network_peers")
    .upsert(
      {
        id: row.id ?? randomUUID(),
        device_id: row.device_id,
        user_id: row.user_id,
        organization_id: row.organization_id ?? null,
        provider: row.provider,
        node_id: row.node_id ?? null,
        mesh_ip: row.mesh_ip ?? null,
        hostname: row.hostname ?? null,
        mac_address: row.mac_address ?? null,
        direct_connected: row.direct_connected ?? false,
        relay_connected: row.relay_connected ?? false,
        eligible_for_wake: row.eligible_for_wake ?? false,
        metadata: row.metadata ?? {},
        last_seen_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id,provider" },
    );
  if (error) throw new Error(`upsertNetworkPeer: ${error.message}`);
}

export async function listNetworkPeersForDevice(params: {
  deviceId: string;
}): Promise<NetworkPeerRow[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("network_peers")
    .select("*")
    .eq("device_id", params.deviceId)
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`listNetworkPeersForDevice: ${error.message}`);
  return (data ?? []) as NetworkPeerRow[];
}

export async function updateDevicePresenceTimestamp(deviceId: string): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("devices")
    .update({
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", deviceId);
  if (error) throw new Error(`updateDevicePresenceTimestamp: ${error.message}`);
}

export async function updateDeviceNetworkSnapshot(params: {
  deviceId: string;
  ipv6?: string | null;
  mac?: string | null;
  udpPort?: number | null;
  networkEpoch?: number | null;
}): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("devices")
    .update({
      last_known_ipv6: params.ipv6 ?? null,
      last_known_mac: params.mac ?? null,
      last_udp_port: params.udpPort ?? null,
      last_seen_network_epoch: params.networkEpoch ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.deviceId);
  if (error) throw new Error(`updateDeviceNetworkSnapshot: ${error.message}`);
}

export async function updateDeviceWakeResult(params: {
  deviceId: string;
  method?: "tailscale_direct" | "udp_path_probe" | "ipv6_magic_packet" | "lan_broadcast" | null;
  success: boolean;
}): Promise<void> {
  const supabase = await getClient();
  const device = await getDeviceById(params.deviceId);
  if (!device) {
    throw new Error("updateDeviceWakeResult: device not found");
  }
  const nextFailCount = params.success ? 0 : (device.wake_fail_count ?? 0) + 1;
  const { error } = await supabase
    .from("devices")
    .update({
      wake_method_last_success: params.success ? (params.method ?? null) : (device.wake_method_last_success ?? null),
      wake_fail_count: nextFailCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.deviceId);
  if (error) throw new Error(`updateDeviceWakeResult: ${error.message}`);
}

export async function listDeviceWakeCandidates(params: {
  deviceId: string;
}): Promise<DeviceWakeCandidateRow[]> {
  const device = await getDeviceById(params.deviceId);
  if (!device) return [];
  const peers = await listNetworkPeersForDevice({ deviceId: params.deviceId });
  const candidates: DeviceWakeCandidateRow[] = [];

  const deviceMac = typeof device.last_known_mac === "string" ? device.last_known_mac : null;
  const deviceIpv6 = typeof device.last_known_ipv6 === "string" ? device.last_known_ipv6 : null;
  candidates.push({
    device_id: params.deviceId,
    provider: "device_snapshot",
    mac_address: deviceMac,
    ipv6: deviceIpv6,
    udp_port: device.last_udp_port ?? null,
    eligible_for_wake: Boolean(deviceMac || deviceIpv6),
    last_seen_at: device.last_seen_at ?? null,
  });

  for (const peer of peers) {
    const metadata = (peer.metadata && typeof peer.metadata === "object") ? peer.metadata as Record<string, unknown> : {};
    const ipv6 = typeof metadata.ipv6 === "string"
      ? metadata.ipv6
      : (typeof peer.mesh_ip === "string" && peer.mesh_ip.includes(":") ? peer.mesh_ip : null);
    const udpPort = typeof metadata.udpPort === "number" ? metadata.udpPort : null;
    candidates.push({
      device_id: params.deviceId,
      provider: peer.provider,
      mac_address: peer.mac_address ?? null,
      ipv6,
      udp_port: udpPort,
      eligible_for_wake: Boolean(peer.eligible_for_wake),
      last_seen_at: typeof metadata.lastSeenAt === "string" ? metadata.lastSeenAt : null,
    });
  }

  return candidates
    .filter((candidate) => candidate.mac_address || candidate.ipv6)
    .sort((a, b) => Number(b.eligible_for_wake) - Number(a.eligible_for_wake));
}

export async function upsertRuntimeCapability(row: RuntimeCapabilityRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("runtime_capabilities")
    .upsert(
      {
        id: row.id ?? randomUUID(),
        device_id: row.device_id,
        user_id: row.user_id,
        organization_id: row.organization_id ?? null,
        capability_key: row.capability_key,
        enabled: row.enabled,
        requires_consent: row.requires_consent ?? true,
        consent_version: row.consent_version ?? 1,
        consented_at: row.consented_at ?? null,
        metadata: row.metadata ?? {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: "device_id,capability_key" },
    );
  if (error) throw new Error(`upsertRuntimeCapability: ${error.message}`);
}

export async function upsertWorkflowCheckpoint(row: WorkflowCheckpointRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("workflow_checkpoints")
    .upsert(
      {
        id: row.id ?? randomUUID(),
        execution_id: row.execution_id,
        workflow_id: row.workflow_id,
        user_id: row.user_id ?? null,
        organization_id: row.organization_id ?? null,
        step_key: row.step_key,
        status: row.status,
        payload: row.payload ?? {},
        error: row.error ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "execution_id,step_key" },
    );
  if (error) throw new Error(`upsertWorkflowCheckpoint: ${error.message}`);
}

export async function listWorkflowCheckpoints(executionId: string): Promise<WorkflowCheckpointRow[]> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("workflow_checkpoints")
    .select("*")
    .eq("execution_id", executionId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`listWorkflowCheckpoints: ${error.message}`);
  return (data ?? []) as WorkflowCheckpointRow[];
}

export async function upsertApprovalPolicy(row: ApprovalPolicyRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("approval_policies")
    .upsert({
      id: row.id ?? randomUUID(),
      organization_id: row.organization_id ?? null,
      user_id: row.user_id ?? null,
      device_id: row.device_id ?? null,
      action_pattern: row.action_pattern,
      risk_level: row.risk_level,
      approval_mode: row.approval_mode,
      is_enabled: row.is_enabled,
      metadata: row.metadata ?? {},
      updated_at: new Date().toISOString(),
    });
  if (error) throw new Error(`upsertApprovalPolicy: ${error.message}`);
}

export async function listApprovalPolicies(params: {
  organizationId?: string | null;
  userId?: string | null;
  deviceId?: string | null;
}): Promise<ApprovalPolicyRow[]> {
  const supabase = await getClient();
  let query = supabase.from("approval_policies").select("*").eq("is_enabled", true);
  if (params.organizationId) query = query.eq("organization_id", params.organizationId);
  if (params.userId) query = query.eq("user_id", params.userId);
  if (params.deviceId) query = query.eq("device_id", params.deviceId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`listApprovalPolicies: ${error.message}`);
  return (data ?? []) as ApprovalPolicyRow[];
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

  // Preferred path: atomic DB function (handles concurrent increments safely).
  try {
    const { data, error } = await supabase.rpc("consume_rate_limit_entry", {
      p_key: params.key,
      p_limit: params.limit,
      p_window_ms: params.windowMs,
    });

    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : null;
    if (row && typeof row.allowed === "boolean") {
      return {
        allowed: row.allowed,
        retryAfterMs: Number(row.retry_after_ms ?? 0),
      };
    }
  } catch {
    // Fall through to non-RPC compatibility path when function is unavailable.
  }

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

// ─────────────────────────────────────────────────────────────────────────────
// Plugin manifests (Phase 4)
// ─────────────────────────────────────────────────────────────────────────────

export type PluginManifestRow = {
  plugin_id: string;
  name: string;
  version: string;
  description?: string | null;
  author?: string | null;
  homepage?: string | null;
  capabilities: Record<string, unknown>[];
  required_scopes: string[];
  sandboxed: boolean;
  trusted_publisher: boolean;
  status: "pending" | "approved" | "rejected" | "deprecated";
  organization_id?: string | null;
};

export async function upsertPluginManifest(row: PluginManifestRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("plugin_manifests").upsert(
    {
      plugin_id: row.plugin_id,
      name: row.name,
      version: row.version,
      description: row.description ?? null,
      author: row.author ?? null,
      homepage: row.homepage ?? null,
      capabilities: row.capabilities,
      required_scopes: row.required_scopes,
      sandboxed: row.sandboxed,
      trusted_publisher: row.trusted_publisher,
      status: row.status,
      organization_id: row.organization_id ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plugin_id" },
  );

  if (error) throw new Error(`upsertPluginManifest: ${error.message}`);
}

export async function getPluginManifest(
  pluginId: string,
): Promise<PluginManifestRow | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("plugin_manifests")
    .select(
      "plugin_id, name, version, description, author, homepage, capabilities, required_scopes, sandboxed, trusted_publisher, status, organization_id",
    )
    .eq("plugin_id", pluginId)
    .maybeSingle();

  if (error) throw new Error(`getPluginManifest: ${error.message}`);
  return (data as PluginManifestRow | null) ?? null;
}

export async function listPluginManifests(options?: {
  trustedOnly?: boolean;
  status?: PluginManifestRow["status"];
  organizationId?: string | null;
}): Promise<PluginManifestRow[]> {
  const supabase = await getClient();
  let query = supabase
    .from("plugin_manifests")
    .select(
      "plugin_id, name, version, description, author, homepage, capabilities, required_scopes, sandboxed, trusted_publisher, status, organization_id",
    );

  if (options?.status) {
    query = query.eq("status", options.status);
  }

  if (options?.trustedOnly) {
    query = query.eq("trusted_publisher", true);
  }

  if (options?.organizationId === null) {
    query = query.is("organization_id", null);
  } else if (options?.organizationId) {
    query = query.or(
      `organization_id.eq.${options.organizationId},organization_id.is.null`,
    );
  }

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(`listPluginManifests: ${error.message}`);
  return (data ?? []) as PluginManifestRow[];
}

export async function updatePluginManifestStatus(
  pluginId: string,
  status: PluginManifestRow["status"],
  reviewedBy?: string,
): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("plugin_manifests")
    .update({
      status,
      reviewed_by: reviewedBy ?? null,
      reviewed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("plugin_id", pluginId);

  if (error) throw new Error(`updatePluginManifestStatus: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Marketplace (Phase 5)
// ─────────────────────────────────────────────────────────────────────────────

export type MarketplaceListingRow = {
  plugin_id: string;
  trust_level: "community" | "verified" | "official";
  category: string;
  downloads: number;
  rating: number;
  review_count: number;
};

export type MarketplaceSubmissionRow = {
  plugin_id: string;
  submitted_by?: string | null;
  category: string;
  repository_url?: string | null;
  status: "pending_review" | "approved" | "rejected";
  review_notes?: string | null;
  reviewed_by?: string | null;
};

export async function upsertMarketplaceListing(
  row: MarketplaceListingRow,
): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("marketplace_listings").upsert(
    {
      plugin_id: row.plugin_id,
      trust_level: row.trust_level,
      category: row.category,
      downloads: row.downloads,
      rating: row.rating,
      review_count: row.review_count,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "plugin_id" },
  );

  if (error) throw new Error(`upsertMarketplaceListing: ${error.message}`);
}

export async function getMarketplaceListing(
  pluginId: string,
): Promise<MarketplaceListingRow | null> {
  const supabase = await getClient();
  const { data, error } = await supabase
    .from("marketplace_listings")
    .select(
      "plugin_id, trust_level, category, downloads, rating, review_count, listed_at",
    )
    .eq("plugin_id", pluginId)
    .maybeSingle();

  if (error) throw new Error(`getMarketplaceListing: ${error.message}`);
  return (data as MarketplaceListingRow | null) ?? null;
}

export async function listMarketplaceListings(options?: {
  category?: string;
  trustLevel?: string;
  limit?: number;
}): Promise<(MarketplaceListingRow & { listed_at: string })[]> {
  const supabase = await getClient();
  let query = supabase
    .from("marketplace_listings")
    .select(
      "plugin_id, trust_level, category, downloads, rating, review_count, listed_at",
    );

  if (options?.category) {
    query = query.eq("category", options.category);
  }

  if (options?.trustLevel) {
    query = query.eq("trust_level", options.trustLevel);
  }

  query = query.order("downloads", { ascending: false });

  if (options?.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`listMarketplaceListings: ${error.message}`);
  return (data ?? []) as (MarketplaceListingRow & { listed_at: string })[];
}

export async function insertMarketplaceSubmission(
  row: MarketplaceSubmissionRow,
): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("marketplace_submissions").insert({
    plugin_id: row.plugin_id,
    submitted_by: row.submitted_by ?? null,
    category: row.category,
    repository_url: row.repository_url ?? null,
    status: row.status,
    submitted_at: new Date().toISOString(),
  });

  if (error) throw new Error(`insertMarketplaceSubmission: ${error.message}`);
}

export async function updateMarketplaceSubmission(
  pluginId: string,
  update: {
    status: "approved" | "rejected";
    reviewedBy?: string;
    reviewNotes?: string;
  },
): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase
    .from("marketplace_submissions")
    .update({
      status: update.status,
      reviewed_by: update.reviewedBy ?? null,
      review_notes: update.reviewNotes ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("plugin_id", pluginId)
    .eq("status", "pending_review");

  if (error) throw new Error(`updateMarketplaceSubmission: ${error.message}`);
}

export async function listMarketplaceSubmissions(
  status?: "pending_review" | "approved" | "rejected",
): Promise<(MarketplaceSubmissionRow & { submitted_at: string })[]> {
  const supabase = await getClient();
  let query = supabase
    .from("marketplace_submissions")
    .select(
      "plugin_id, submitted_by, category, repository_url, status, review_notes, reviewed_by, submitted_at",
    );

  if (status) {
    query = query.eq("status", status);
  }

  query = query.order("submitted_at", { ascending: false });

  const { data, error } = await query;
  if (error) throw new Error(`listMarketplaceSubmissions: ${error.message}`);
  return (data ?? []) as (MarketplaceSubmissionRow & { submitted_at: string })[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Ecosystem adapter requests (Phase 5)
// ─────────────────────────────────────────────────────────────────────────────

export type EcosystemRequestRow = {
  kind: "webhook" | "sdk" | "external_agent" | "mcp_client";
  source_id: string;
  workflow_id: string;
  execution_id?: string | null;
  status: "queued" | "rejected" | "completed" | "failed";
  metadata?: Record<string, unknown>;
};

export async function insertEcosystemRequest(row: EcosystemRequestRow): Promise<void> {
  const supabase = await getClient();
  const { error } = await supabase.from("ecosystem_requests").insert({
    id: randomUUID(),
    kind: row.kind,
    source_id: row.source_id,
    workflow_id: row.workflow_id,
    execution_id: row.execution_id ?? null,
    status: row.status,
    metadata: row.metadata ?? {},
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`insertEcosystemRequest: ${error.message}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Runtime metrics (Phase 5)
// ─────────────────────────────────────────────────────────────────────────────

export type RuntimeMetricsSnapshot = {
  activeWorkflows: number;
  failedWorkflows24h: number;
  costUsd24h: number;
};

export async function queryRuntimeMetrics(): Promise<RuntimeMetricsSnapshot> {
  const supabase = await getClient();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [activeResult, failedResult, costResult] = await Promise.allSettled([
    supabase
      .from("workflow_runs")
      .select("id", { count: "exact", head: true })
      .in("status", ["running", "queued", "waiting_for_approval"]),
    supabase
      .from("workflow_runs")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed")
      .gte("created_at", since24h),
    supabase
      .from("cost_records")
      .select("estimated_usd")
      .gte("created_at", since24h),
  ]);

  const activeWorkflows =
    activeResult.status === "fulfilled" ? (activeResult.value.count ?? 0) : 0;
  const failedWorkflows24h =
    failedResult.status === "fulfilled" ? (failedResult.value.count ?? 0) : 0;
  const costUsd24h =
    costResult.status === "fulfilled"
      ? (costResult.value.data ?? []).reduce(
          (sum: number, r: { estimated_usd: number }) => sum + r.estimated_usd,
          0,
        )
      : 0;

  return { activeWorkflows, failedWorkflows24h, costUsd24h };
}
