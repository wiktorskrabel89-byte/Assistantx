import { createClient } from "@/lib/server";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ memories: [], summaries: [], knowledgeStats: null }, { status: 401 });

  // Sample the most recent conversations to surface recent summary snapshots
  // without issuing an unbounded query for every chat the user has ever opened.
  const conversations = await supabase
    .from("conversations")
    .select("id")
    .eq("user_id", user.id)
    .limit(12);
  const conversationIds = Array.isArray(conversations.data) ? conversations.data.map((item) => item.id) : [];

  const [memories, summaries, files] = await Promise.all([
    supabase
      .from("user_profile_memories")
      .select("id, memory_key, memory_value, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    conversationIds.length > 0
      ? supabase
          .from("memory_summaries")
          .select("id, summary, created_at, conversation_id")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: false })
          .limit(8)
      : Promise.resolve({ data: [] }),
    supabase
      .from("knowledge_files")
      .select("id, status, chunk_count")
      .eq("user_id", user.id),
  ]);

  const knowledgeFiles = Array.isArray(files.data) ? files.data : [];
  const readyFiles = knowledgeFiles.filter((item) => item.status === "ready").length;
  const totalChunks = knowledgeFiles.reduce((sum, item) => sum + (typeof item.chunk_count === "number" ? item.chunk_count : 0), 0);

  return Response.json({
    memories: memories.data ?? [],
    summaries: summaries.data ?? [],
    knowledgeStats: {
      fileCount: knowledgeFiles.length,
      readyFiles,
      totalChunks,
    },
  });
}
