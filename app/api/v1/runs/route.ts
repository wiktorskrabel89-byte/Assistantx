import { resolveActor, extractBearerToken } from "@/src/core/auth/actor-resolver";
import { listWorkflowRuns } from "@/src/core/persistence/runtime-db";
import type { ApiV1Error, ApiV1RunSummary } from "@/src/api/v1/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET(request: Request) {
  const token = extractBearerToken(request.headers.get("Authorization"));
  if (!token) {
    const err: ApiV1Error = { error: "Authorization header required.", code: "unauthorized" };
    return Response.json(err, { status: 401 });
  }

  const actorResult = await resolveActor({ bearerToken: token });
  if (!actorResult.ok) {
    const err: ApiV1Error = { error: actorResult.error, code: "unauthorized" };
    return Response.json(err, { status: actorResult.status });
  }

  const resolvedUserId = actorResult.actor.userId;
  if (!resolvedUserId) {
    const err: ApiV1Error = { error: "User identity could not be resolved.", code: "unauthorized" };
    return Response.json(err, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawStatus = searchParams.get("status");
  const VALID_STATUSES = new Set([
    "queued", "running", "waiting_for_approval", "completed", "failed",
  ] as const);
  const status = VALID_STATUSES.has(rawStatus as "queued") ? rawStatus as
    | "queued" | "running" | "waiting_for_approval" | "completed" | "failed"
    : undefined;
  const limit = Math.min(100, Math.max(1, Number(searchParams.get("limit") ?? 50)));
  const requestedOrgId = searchParams.get("organizationId") ?? actorResult.actor.organizationId;

  let runs: ApiV1RunSummary[] = [];
  try {
    const rows = await listWorkflowRuns({
      userId: resolvedUserId,
      organizationId: requestedOrgId,
      status,
      limit,
    });

    runs = rows.map((row) => ({
      executionId: row.execution_id,
      workflowId: row.workflow_id,
      status: row.status,
      createdAt: row.created_at ?? new Date(0).toISOString(),
      completedAt: row.completed_at ?? undefined,
    }));
  } catch {
    // DB unavailable — return empty list rather than a 5xx.
    runs = [];
  }

  return Response.json({ runs, total: runs.length });
}
