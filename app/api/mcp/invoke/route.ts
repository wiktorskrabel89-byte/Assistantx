import { handleMcpServerRequest } from "@/src/mcp/server/server";
import { authorizeMcpRequest } from "../_auth";

export const runtime = "nodejs";
export const maxDuration = 60;

type McpInvokeBody = {
  toolName?: string;
  input?: Record<string, unknown>;
};

export async function POST(request: Request) {
  const auth = await authorizeMcpRequest(request);
  if (!auth.ok) {
    return Response.json({ error: auth.error }, { status: auth.status });
  }

  const body = await request.json().catch(() => null) as McpInvokeBody | null;
  if (!body || typeof body.toolName !== "string" || !body.toolName.trim()) {
    return Response.json({ error: "toolName is required." }, { status: 400 });
  }
  if (!body.input || typeof body.input !== "object" || Array.isArray(body.input)) {
    return Response.json({ error: "input must be an object." }, { status: 400 });
  }

  const result = await handleMcpServerRequest(
    body.toolName.trim(),
    body.input,
    auth.actorUserId,
  );

  return Response.json(result, { status: result.ok ? 200 : 400 });
}
