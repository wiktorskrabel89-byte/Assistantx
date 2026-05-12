import type { ApiV1Error, ApiV1RunSummary } from "@/src/api/v1/types";

export const runtime = "nodejs";
export const maxDuration = 30;

// Phase-4: Returns a paginated list of recent workflow runs for the authenticated user/org.
// DB integration will be wired in the multitenancy migration step.
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    const err: ApiV1Error = { error: "Authorization header required.", code: "unauthorized" };
    return Response.json(err, { status: 401 });
  }

  const runs: ApiV1RunSummary[] = [];
  return Response.json({ runs, total: 0 });
}
