import { ToolRouter } from "@/src/tools/router/router";
import { resolveActor, extractBearerToken } from "@/src/core/auth/actor-resolver";
import type { ApiV1ToolInvokeRequest, ApiV1ToolInvokeResponse } from "@/src/api/v1/types";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

const toolRouter = new ToolRouter();

export async function POST(request: Request) {
  const token = extractBearerToken(request.headers.get("Authorization"));
  if (!token) {
    return Response.json({ error: "Authorization header required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as ApiV1ToolInvokeRequest | null;
  if (!body || typeof body.toolId !== "string") {
    return Response.json({ error: "toolId is required." }, { status: 400 });
  }
  if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
    return Response.json({ error: "input must be an object." }, { status: 400 });
  }

  const actorResult = await resolveActor({
    bearerToken: token,
    requestedOrganizationId:
      typeof body.organizationId === "string" ? body.organizationId : null,
  });

  if (!actorResult.ok) {
    return Response.json({ error: actorResult.error }, { status: actorResult.status });
  }

  const executionId = randomUUID();
  const result = await toolRouter.execute(
    {
      toolId: body.toolId,
      input: body.input,
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : undefined,
    },
    {
      executionId,
      workflowId: "v1/tools",
      actor: actorResult.actor,
    },
  );

  const response: ApiV1ToolInvokeResponse = {
    ok: result.ok,
    toolId: result.toolId,
    output: result.output,
    error: result.error,
  };
  return Response.json(response, { status: result.ok ? 200 : 400 });
}
