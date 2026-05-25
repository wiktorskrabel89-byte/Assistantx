import { resolveActor, extractBearerToken } from "@/src/core/auth/actor-resolver";
import { listWorkflowRuns } from "@/src/core/persistence/runtime-db";
import type { ApiV1Error, ApiV1RunSummary } from "@/src/api/v1/types";

export const runtime = "nodejs";
export const maxDuration = 30;

const VALID_STATUSES = [
  "queued",
  "running",
  "waiting_for_approval",
  "completed",
  "failed",
] as const;
type ValidStatus = (typeof VALID_STATUSES)[number];
const VALID_STATUS_SET = new Set<string>(VALID_STATUSES);

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
  if (rawStatus && !VALID_STATUS_SET.has(rawStatus)) {
    const err: ApiV1Error = { error: "Invalid status filter.", code: "invalid_status" };
    return Response.json(err, { status: 400 });
  }
  const status = rawStatus as ValidStatus | null;
  const rawLimit = searchParams.get("limit");
  const parsedLimit = rawLimit ? Number(rawLimit) : 50;
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
    const err: ApiV1Error = {
      error: "limit must be an integer between 1 and 100.",
      code: "invalid_limit",
    };
    return Response.json(err, { status: 400 });
  }
  const limit = parsedLimit;
  const requestedOrgId = searchParams.get("organizationId") ?? actorResult.actor.organizationId;

  let runs: ApiV1RunSummary[] = [];
  try {
    const rows = await listWorkflowRuns({
      userId: resolvedUserId,
      organizationId: requestedOrgId,
      status: status ?? undefined,
      limit,
    });

    runs = rows.map((row) => ({
      executionId: row.execution_id,
      workflowId: row.workflow_id,
      status: row.status,
      createdAt: row.created_at ?? new Date(0).toISOString(),
      completedAt: row.completed_at ?? undefined,
      orchestrator: (
        row.output
        && typeof row.output === "object"
        && "orchestrator" in row.output
        && row.output.orchestrator === "ruflo"
      ) ? "ruflo" : "inngest",
      runPhase: (
        row.output
        && typeof row.output === "object"
        && "runPhase" in row.output
        && typeof row.output.runPhase === "string"
      ) ? row.output.runPhase : undefined,
    }));
  } catch {
    // DB unavailable — return empty list rather than a 5xx.
    runs = [];
  }

  return Response.json({ runs, total: runs.length });
}
