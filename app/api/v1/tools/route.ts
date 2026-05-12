import { ToolRouter } from "@/src/tools/router/router";
import type { ApiV1ToolInvokeRequest, ApiV1ToolInvokeResponse } from "@/src/api/v1/types";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export const maxDuration = 30;

const toolRouter = new ToolRouter();

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
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

  const executionId = randomUUID();
  const result = await toolRouter.execute(
    { toolId: body.toolId, input: body.input },
    {
      executionId,
      workflowId: "v1/tools",
      // TODO: resolve token to actual userId/organizationId via Supabase Auth
      // before this route is exposed to production traffic.
      actor: { userId: null, organizationId: null, sessionId: token.slice(0, 32) },
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
