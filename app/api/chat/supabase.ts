import { createClient } from "@/lib/server";
import { type UserPlan } from "@/lib/ai-config";
import {
  createOpenRouterEmbedding,
  extractUserProfileFacts,
  formatKnowledgeContext,
  toPgVectorLiteral,
} from "@/app/lib/knowledge";

export type CachedAnswerCandidate = {
  answer: string;
  similarity: number;
  answerId?: string;
};

export const CACHED_ANSWER_SIMILARITY_THRESHOLD = 0.9;
const KNOWLEDGE_MATCH_COUNT = 10;
const KNOWLEDGE_MAX_TOTAL_TOKENS = 1500;

export function getSupabase() {
  return createClient();
}

export async function getAuthUserId(req: Request): Promise<string | null> {
  try {
    const authHeader = req.headers.get("authorization");
    if (!authHeader) return null;
    const token = authHeader.replace("Bearer ", "");
    const supabase = await getSupabase();
    const { data } = await supabase.auth.getUser(token);
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Reads the user's plan from their workspace_states record in Supabase.
 * Falls back to the client-supplied plan if the server lookup fails.
 */
export async function getServerSideUserPlan(userId: string | null, clientPlan: UserPlan): Promise<UserPlan> {
  if (!userId) return clientPlan;
  try {
    const supabase = await getSupabase();
    const { data } = await supabase
      .from("workspace_states")
      .select("state_json")
      .eq("user_id", userId)
      .single();
    if (!data?.state_json) return clientPlan;
    const VALID_USER_PLANS: UserPlan[] = ["free", "pro", "pro+"];
    const rawPlan = (data.state_json as Record<string, unknown>).userPlan;
    if (typeof rawPlan === "string" && VALID_USER_PLANS.includes(rawPlan as UserPlan)) {
      return rawPlan as UserPlan;
    }
    return clientPlan;
  } catch {
    return clientPlan;
  }
}

export async function getMemoryHistory(conversationId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase.rpc("get_memory_limited_messages", {
    p_conversation_id: conversationId,
    p_max_tokens: 4000,
    p_max_messages: 20,
  });
  return data ?? [];
}

export async function getMemorySummaries(conversationId: string) {
  const supabase = await getSupabase();
  const { data } = await supabase
    .from("memory_summaries")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  return data ?? [];
}

export async function saveMessage(conversationId: string, role: "user" | "assistant", content: string) {
  const supabase = await getSupabase();
  await supabase.from("messages").insert({
    conversation_id: conversationId,
    role,
    content,
    token_count: Math.ceil(content.length / 4),
  });
}

export async function ensureConversation(conversationId: string, userId: string | null) {
  if (!userId) return;
  const supabase = await getSupabase();

  const { data: existing } = await supabase
    .from("conversations")
    .select("user_id")
    .eq("id", conversationId)
    .maybeSingle();

  if (existing && existing.user_id && existing.user_id !== userId) {
    const err = new Error("Unauthorized: conversation belongs to another user") as Error & { status: number };
    err.status = 403;
    throw err;
  }

  await supabase.from("conversations").upsert(
    { id: conversationId, user_id: userId },
    { onConflict: "id" }
  );
}

export async function findKnowledgeContext(userId: string, queryEmbedding: number[]) {
  try {
    const supabase = await getSupabase();
    const vector = toPgVectorLiteral(queryEmbedding);
    const [chunkResult, profileResult] = await Promise.all([
      supabase.rpc("match_documents", {
        p_user_id: userId,
        p_query_embedding: vector,
        match_count: KNOWLEDGE_MATCH_COUNT,
        max_total_tokens: KNOWLEDGE_MAX_TOTAL_TOKENS,
      }),
      supabase.rpc("match_user_profile_memories", {
        p_user_id: userId,
        p_query_embedding: vector,
        p_match_count: 4,
      }),
    ]);

    const chunks = Array.isArray(chunkResult.data) ? chunkResult.data as Array<{ file_name: string; content: string; similarity: number }> : [];
    const profileMemories = Array.isArray(profileResult.data) ? profileResult.data as Array<{ memory_key: string; memory_value: string }> : [];
    return formatKnowledgeContext(chunks, profileMemories);
  } catch {
    return "";
  }
}

export async function findCachedAnswer(userId: string, queryEmbedding: number[]): Promise<CachedAnswerCandidate | null> {
  try {
    const supabase = await getSupabase();
    const vector = toPgVectorLiteral(queryEmbedding);
    const { data } = await supabase.rpc("match_cached_answers", {
      p_user_id: userId,
      p_query_embedding: vector,
      p_match_count: 1,
      p_min_similarity: CACHED_ANSWER_SIMILARITY_THRESHOLD,
    });
    const first = Array.isArray(data) ? data[0] as { answer?: string; similarity?: number; answer_id?: string } : null;
    if (!first?.answer || typeof first.similarity !== "number") return null;
    return { answer: first.answer, similarity: first.similarity, answerId: first.answer_id };
  } catch {
    return null;
  }
}

export async function saveCachedAnswer(userId: string, question: string, answer: string, queryEmbedding: number[]) {
  try {
    const supabase = await getSupabase();
    await supabase.from("knowledge_qa_cache").insert({
      user_id: userId,
      question,
      answer,
      question_embedding: toPgVectorLiteral(queryEmbedding),
      similarity_hint: null,
      usage_count: 0,
    });
  } catch {
    // best effort
  }
}

export async function incrementCachedAnswerUsage(answerId: string, userId: string) {
  try {
    const supabase = await getSupabase();
    await supabase.rpc("increment_qa_cache_usage", { answer_id: answerId, answer_user_id: userId });
  } catch {
    // best effort
  }
}

export async function saveUserProfileFacts(userId: string, message: string, queryEmbedding: number[]) {
  const facts = extractUserProfileFacts(message);
  if (facts.length === 0) return;
  try {
    const supabase = await getSupabase();
    for (const fact of facts) {
      const existing = await supabase
        .from("user_profile_memories")
        .select("id")
        .eq("user_id", userId)
        .eq("memory_key", fact.key)
        .maybeSingle();

      if ((existing.data as { id?: string } | null)?.id) {
        await supabase
          .from("user_profile_memories")
          .update({
            memory_value: fact.value,
            source_message: message.slice(0, 1000),
            embedding: toPgVectorLiteral(queryEmbedding),
          })
          .eq("id", (existing.data as { id: string }).id)
          .eq("user_id", userId);
      } else {
        await supabase.from("user_profile_memories").insert({
          user_id: userId,
          memory_key: fact.key,
          memory_value: fact.value,
          source_message: message.slice(0, 1000),
          embedding: toPgVectorLiteral(queryEmbedding),
        });
      }
    }
  } catch {
    // best effort
  }
}

export async function getQueryEmbedding(message: string) {
  return createOpenRouterEmbedding(message);
}
