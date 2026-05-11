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

  return {
    executionId: result.executionId,
    accepted: result.status !== "failed",
    status: result.status === "failed" ? "rejected" : "queued",
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

export function collectRuntimeMetrics(): RuntimeHealthMetrics {
  // Phase-5 scaffold: replace with live instrumentation data from OpenTelemetry/Langfuse.
  return {
    uptime: process.uptime(),
    activeWorkflows: 0,
    failedWorkflows24h: 0,
    avgLatencyMs: 0,
    costUsd24h: 0,
  };
}
