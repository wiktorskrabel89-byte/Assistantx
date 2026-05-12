// Cross-platform runtime adapter contracts.
// External agents, webhooks, and SDK consumers interact with AssistantX
// through this boundary — mapping incoming requests to internal runtime primitives.

export type RuntimeAdapterKind = "webhook" | "sdk" | "external_agent" | "mcp_client";

export type ExternalRuntimeRequest = {
  kind: RuntimeAdapterKind;
  sourceId: string;
  workflow: string;
  input: Record<string, unknown>;
  callbackUrl?: string;
  metadata?: Record<string, unknown>;
};

export type ExternalRuntimeResponse = {
  executionId: string;
  accepted: boolean;
  status: "queued" | "rejected";
  error?: string;
};

export async function acceptExternalRequest(
  request: ExternalRuntimeRequest,
): Promise<ExternalRuntimeResponse> {
  const { executeRuntimeRequest } = await import(
    "@/src/backend/runtime/runtime-facade"
  );

  const result = await executeRuntimeRequest({
    workflow: request.workflow,
    input: {
      ...request.input,
      _source: request.kind,
      _sourceId: request.sourceId,
    },
    actor: { userId: null, organizationId: null, sessionId: null },
  });

  const accepted = result.status !== "failed";
  const responseStatus: "queued" | "rejected" = accepted ? "queued" : "rejected";

  // Log the external request to the ecosystem_requests audit table.
  try {
    const { insertEcosystemRequest } = await import(
      "@/src/core/persistence/runtime-db"
    );
    await insertEcosystemRequest({
      kind: request.kind,
      source_id: request.sourceId,
      workflow_id: request.workflow,
      execution_id: result.executionId,
      status: responseStatus,
      metadata: {
        ...(request.metadata ?? {}),
        callbackUrl: request.callbackUrl ?? null,
      },
    });
  } catch {
    // Audit write is best-effort — do not fail the response.
  }

  return {
    executionId: result.executionId,
    accepted,
    status: responseStatus,
    error: result.error,
  };
}

export type RuntimeHealthMetrics = {
  uptime: number;
  activeWorkflows: number;
  failedWorkflows24h: number;
  avgLatencyMs: number;
  costUsd24h: number;
};

export async function collectRuntimeMetrics(): Promise<RuntimeHealthMetrics> {
  const base = { uptime: process.uptime(), avgLatencyMs: 0 };

  try {
    const { queryRuntimeMetrics } = await import(
      "@/src/core/persistence/runtime-db"
    );
    const snapshot = await queryRuntimeMetrics();
    return {
      ...base,
      activeWorkflows: snapshot.activeWorkflows,
      failedWorkflows24h: snapshot.failedWorkflows24h,
      costUsd24h: snapshot.costUsd24h,
    };
  } catch {
    // Fallback when DB is unavailable.
    return {
      ...base,
      activeWorkflows: 0,
      failedWorkflows24h: 0,
      costUsd24h: 0,
    };
  }
}
