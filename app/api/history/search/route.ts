import { createClient } from "@/lib/server";
import { hasSupabaseConfig } from "@/lib/supabase-config";

export const maxDuration = 20;

type SearchHit = {
  id: string;
  type: "chat" | "command" | "notification";
  title: string;
  preview: string;
  createdAt: string;
  /** Filters/metadata */
  meta?: Record<string, string | number | null | undefined>;
};

type SearchResponse = {
  hits: SearchHit[];
  available: boolean;
  query: string;
  error?: string;
};

function truncate(text: string, max = 160) {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max)}…` : cleaned;
}

function highlightQuery(text: string, query: string) {
  if (!query.trim()) return text;
  return text.replace(new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), (match) => `**${match}**`);
}

export async function GET(request: Request) {
  if (!hasSupabaseConfig()) {
    return Response.json(
      { hits: [], available: false, query: "", error: "Supabase is not configured." },
      { status: 503 }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawQuery = (searchParams.get("q") ?? "").trim();
  const typeFilter = searchParams.get("type") ?? "all"; // "all" | "chat" | "command" | "notification"
  const sinceParam = searchParams.get("since"); // ISO date string

  if (!rawQuery) {
    return Response.json({ hits: [], available: true, query: "" });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return Response.json({ hits: [], available: false, query: rawQuery, error: "Unauthenticated." });
  }

  const hits: SearchHit[] = [];
  const since = sinceParam ? new Date(sinceParam).toISOString() : null;

  // ── Search notifications ────────────────────────────────────────────────
  if (typeFilter === "all" || typeFilter === "notification") {
    try {
      let q = supabase
        .from("notifications")
        .select("id, title, body, kind, created_at")
        .eq("user_id", user.id)
        .ilike("title", `%${rawQuery}%`)
        .order("created_at", { ascending: false })
        .limit(15);

      if (since) q = q.gte("created_at", since);

      const { data } = await q;
      if (Array.isArray(data)) {
        for (const row of data) {
          hits.push({
            id: String(row.id),
            type: "notification",
            title: highlightQuery(String(row.title ?? ""), rawQuery),
            preview: truncate(String(row.body ?? "")),
            createdAt: String(row.created_at ?? ""),
            meta: { kind: row.kind },
          });
        }
      }
    } catch {
      // Table may not exist; skip gracefully
    }
  }

  // ── Search command execution history ────────────────────────────────────
  if (typeFilter === "all" || typeFilter === "command") {
    try {
      let q = supabase
        .from("command_execution_history")
        .select("id, slash, result_summary, status, created_at, source")
        .eq("user_id", user.id)
        .ilike("slash", `%${rawQuery}%`)
        .order("created_at", { ascending: false })
        .limit(20);

      if (since) q = q.gte("created_at", since);

      const { data } = await q;
      if (Array.isArray(data)) {
        for (const row of data) {
          hits.push({
            id: String(row.id),
            type: "command",
            title: highlightQuery(String(row.slash ?? ""), rawQuery),
            preview: truncate(String(row.result_summary ?? "")),
            createdAt: String(row.created_at ?? ""),
            meta: {
              status: row.status,
              source: row.source,
            },
          });
        }
      }
    } catch {
      // Table may not exist; skip gracefully
    }
  }

  // ── Search synced chat history ───────────────────────────────────────────
  if (typeFilter === "all" || typeFilter === "chat") {
    try {
      let q = supabase
        .from("workspaces")
        .select("id, data, updated_at")
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .limit(5);

      if (since) q = q.gte("updated_at", since);

      const { data: workspaceRows } = await q;
      if (Array.isArray(workspaceRows)) {
        for (const ws of workspaceRows) {
          const wsData = ws.data as {
            chats?: Array<{ id: string; title?: string; messages?: Array<{ user?: string; ai?: string; createdAt?: number }> }>;
          } | null;
          if (!wsData?.chats) continue;
          for (const chat of wsData.chats) {
            // Match on title
            const titleMatch = (chat.title ?? "").toLowerCase().includes(rawQuery.toLowerCase());
            // Match on any message content
            const msgMatch = (chat.messages ?? []).some(
              (m) =>
                String(m.user ?? "").toLowerCase().includes(rawQuery.toLowerCase()) ||
                String(m.ai ?? "").toLowerCase().includes(rawQuery.toLowerCase())
            );
            if (!titleMatch && !msgMatch) continue;

            const lastMsg = (chat.messages ?? []).at(-1);
            const preview = truncate(lastMsg?.user ?? lastMsg?.ai ?? "");
            const createdAt = lastMsg?.createdAt ? new Date(lastMsg.createdAt).toISOString() : String(ws.updated_at ?? "");
            hits.push({
              id: `${ws.id}::${chat.id}`,
              type: "chat",
              title: highlightQuery(chat.title ?? "Untitled chat", rawQuery),
              preview,
              createdAt,
              meta: { workspaceId: ws.id, chatId: chat.id },
            });
          }
        }
      }
    } catch {
      // Workspace table may not exist; skip gracefully
    }
  }

  // Sort combined hits by date descending
  hits.sort((a, b) => {
    const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return tb - ta;
  });

  const response: SearchResponse = {
    hits: hits.slice(0, 50),
    available: true,
    query: rawQuery,
  };

  return Response.json(response);
}
