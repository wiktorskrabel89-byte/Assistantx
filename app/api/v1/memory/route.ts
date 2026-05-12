import { memoryService } from "@/src/memory/service/memory-service";
import { resolveActor, extractBearerToken } from "@/src/core/auth/actor-resolver";
import type { ApiV1MemorySearchRequest, ApiV1MemorySearchResponse } from "@/src/api/v1/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const token = extractBearerToken(request.headers.get("Authorization"));
  if (!token) {
    return Response.json({ error: "Authorization header required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as ApiV1MemorySearchRequest | null;
  if (!body || typeof body.query !== "string") {
    return Response.json({ error: "query is required." }, { status: 400 });
  }

  const actorResult = await resolveActor({ bearerToken: token });

  if (!actorResult.ok) {
    return Response.json({ error: actorResult.error }, { status: actorResult.status });
  }

  const result = await memoryService.search({
    userId: actorResult.actor.userId!,
    organizationId: actorResult.actor.organizationId,
    layer: body.layer,
    limit: body.limit ?? 20,
  });

  const response: ApiV1MemorySearchResponse = {
    entries: result.entries.map((e) => ({
      id: e.id,
      content: e.content,
      score: e.score,
      layer: e.layer,
    })),
    totalFound: result.totalFound,
  };
  return Response.json(response);
}
