import { executeRuntimeRequest } from "@/src/backend/runtime/runtime-facade";
import type { RuntimeActor, RuntimeExecutionRequest } from "@/src/core/types/runtime";

function toActor(value: unknown): RuntimeActor {
  if (!value || typeof value !== "object") {
    return { userId: null, organizationId: null, sessionId: null };
  }
  const v = value as Record<string, unknown>;
  return {
    userId: typeof v.userId === "string" ? v.userId : null,
    organizationId: typeof v.organizationId === "string" ? v.organizationId : null,
    sessionId: typeof v.sessionId === "string" ? v.sessionId : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const workflow = typeof (body as { workflow?: unknown }).workflow === "string"
    ? (body as { workflow: string }).workflow.trim()
    : "";
  const input = (body as { input?: unknown }).input;

  if (!workflow) {
    return Response.json({ error: "workflow is required." }, { status: 400 });
  }
  if (!isRecord(input)) {
    return Response.json({ error: "input must be an object." }, { status: 400 });
  }

  const req: RuntimeExecutionRequest = {
    workflow,
    input,
    actor: toActor((body as { actor?: unknown }).actor),
  };

  const result = await executeRuntimeRequest(req);
  return Response.json(result);
}

