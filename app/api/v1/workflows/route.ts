import { executeRuntimeRequest } from "@/src/backend/runtime/runtime-facade";
import { resolveActor, extractBearerToken } from "@/src/core/auth/actor-resolver";
import type { ApiV1WorkflowRequest, ApiV1WorkflowResponse } from "@/src/api/v1/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as ApiV1WorkflowRequest | null;
  if (!body || typeof body.workflow !== "string" || !body.workflow.trim()) {
    return Response.json({ error: "workflow is required." }, { status: 400 });
  }
  if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
    return Response.json({ error: "input must be an object." }, { status: 400 });
  }

  const token = extractBearerToken(request.headers.get("Authorization"));
  if (!token) {
    return Response.json({ error: "Authorization header required." }, { status: 401 });
  }

  const actorResult = await resolveActor({
    bearerToken: token,
    requestedOrganizationId:
      typeof body.organizationId === "string" ? body.organizationId : null,
  });

  if (!actorResult.ok) {
    return Response.json({ error: actorResult.error }, { status: actorResult.status });
  }

  const result = await executeRuntimeRequest({
    workflow: body.workflow,
    input: body.input,
    actor: actorResult.actor,
  });

  const response: ApiV1WorkflowResponse = {
    executionId: result.executionId,
    status: result.status,
    output: result.output as Record<string, unknown> | undefined,
    error: result.error,
  };
  return Response.json(response);
}
