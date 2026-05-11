import { memoryService } from "@/src/memory/service/memory-service";
import type { ApiV1MemorySearchRequest, ApiV1MemorySearchResponse } from "@/src/api/v1/types";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) {
    return Response.json({ error: "Authorization header required." }, { status: 401 });
  }

  const body = await request.json().catch(() => null) as ApiV1MemorySearchRequest | null;
  if (!body || typeof body.query !== "string") {
    return Response.json({ error: "query is required." }, { status: 400 });
  }

  const result = await memoryService.search({
    // TODO: resolve token to actual userId via Supabase Auth
    // before this route is exposed to production traffic.
    userId: `api:${token.slice(0, 16)}`,
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
