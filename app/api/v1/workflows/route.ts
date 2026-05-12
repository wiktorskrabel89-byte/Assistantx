import { executeRuntimeRequest } from "@/src/backend/runtime/runtime-facade";
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

  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return Response.json({ error: "Authorization header required." }, { status: 401 });
  }

  const result = await executeRuntimeRequest({
    workflow: body.workflow,
    input: body.input,
    // TODO: resolve token to actual userId/organizationId via Supabase Auth
    // before this route is exposed to production traffic.
    actor: { userId: null, organizationId: null, sessionId: token.slice(0, 32) },
  });

  const response: ApiV1WorkflowResponse = {
    executionId: result.executionId,
    status: result.status,
    output: result.output as Record<string, unknown> | undefined,
    error: result.error,
  };
  return Response.json(response);
}
