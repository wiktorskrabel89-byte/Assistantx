import { createClient } from "@/lib/server";
import { checkRateLimit, getRateLimitKey, rateLimitedResponse } from "@/lib/rateLimit";
import {
  formatWebSearchContext,
  getCachedWebSearch,
  logUsageEvent,
  runTavilySearch,
  saveWebSearchCache,
} from "@/app/lib/ai-platform";

export const runtime = "nodejs";
export const maxDuration = 60;

async function getAuth() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    return { supabase, user };
  } catch (err) {
    console.error("[web-search] Supabase initialization error:", err);
    return { supabase: null, user: null };
  }
}

export async function GET() {
  const { supabase, user } = await getAuth();
  if (!supabase || !user) return Response.json({ searches: [] }, { status: 401 });

  const query = await supabase
    .from("web_search_cache")
    .select("id, query, provider, result_count, created_at, expires_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(12);

  return Response.json({ searches: query.data ?? [] });
}

export async function POST(req: Request) {
  // Web research is more expensive than normal chat prompts, so keep a tighter
  // per-minute cap while still allowing iterative search refinement.
  const rlKey = getRateLimitKey(req, "web-search");
  const rl = checkRateLimit(rlKey, 20, 60_000);
  if (!rl.allowed) return rateLimitedResponse(rl.retryAfterMs);

  const { supabase, user } = await getAuth();
  if (!supabase || !user) return Response.json({ error: "Authentication required." }, { status: 401 });

  const body = await req.json() as { query?: string; forceFresh?: boolean };
  const query = body.query?.trim() ?? "";
  if (!query) return Response.json({ error: "Query is required." }, { status: 400 });

  if (!body.forceFresh) {
    const cached = await getCachedWebSearch({ supabase, userId: user.id, query });
    if (cached) {
      return Response.json({ ...cached, context: formatWebSearchContext(cached.answer, cached.results) });
    }
  }

  try {
    const payload = await runTavilySearch(query);
    const expiresAt = await saveWebSearchCache({ supabase, userId: user.id, payload });
    await logUsageEvent({
      supabase,
      userId: user.id,
      eventType: "web_search",
      provider: payload.provider,
      route: "/api/web-search",
      metadata: { queryLength: query.length, resultCount: payload.results.length },
    });

    return Response.json({
      ...payload,
      expiresAt,
      context: formatWebSearchContext(payload.answer, payload.results),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Web search failed.";
    return Response.json({ error: message }, { status: 502 });
  }
}
