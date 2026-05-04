/**
 * GET /api/stats
 *
 * Returns personal usage statistics for the authenticated user.
 * Falls back to zeros for unauthenticated requests.
 *
 * Response:
 *   {
 *     totalMessages: number,
 *     totalTokens: number,
 *     totalConversations: number,
 *     topModels: Array<{ model: string; count: number }>,
 *     userPlan: string,
 *     premiumRequestsUsed: number,
 *   }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/server";

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");

  const supabase = await createClient();

  // Resolve user (optional auth)
  let userId: string | null = null;
  if (token) {
    const { data: { user } } = await supabase.auth.getUser(token);
    userId = user?.id ?? null;
  }

  if (!userId) {
    return NextResponse.json({
      totalMessages: 0,
      totalTokens: 0,
      totalConversations: 0,
      topModels: [],
      userPlan: "free",
      premiumRequestsUsed: 0,
    });
  }

  // Use a single aggregating RPC to avoid fetching all conversation IDs into
  // application memory and then issuing an unbounded IN() query.  The function
  // joins messages → conversations server-side and returns aggregated counts.
  const [statsResult, conversationsResult, workspaceResult] = await Promise.all([
    supabase.rpc("get_user_message_stats", { p_user_id: userId }),

    // Total conversations (count only)
    supabase
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),

    // User plan and quota
    supabase
      .from("workspace_states")
      .select("state_json")
      .eq("user_id", userId)
      .single(),
  ]);

  const statsRow = (statsResult.data as { total_messages: number; total_tokens: number } | null) ??
    { total_messages: 0, total_tokens: 0 };

  const totalMessages = statsRow.total_messages ?? 0;
  const totalTokens = statsRow.total_tokens ?? 0;

  const totalConversations = conversationsResult.count ?? 0;

  // Extract plan info from workspace state
  const stateJson = workspaceResult.data?.state_json as Record<string, unknown> | null;
  const userPlan = typeof stateJson?.userPlan === "string" ? stateJson.userPlan : "free";
  const premiumRequestsUsed =
    typeof stateJson?.premiumRequestsUsed === "number" ? stateJson.premiumRequestsUsed : 0;

  return NextResponse.json({
    totalMessages,
    totalTokens,
    totalConversations,
    topModels: [],
    userPlan,
    premiumRequestsUsed,
  });
}
