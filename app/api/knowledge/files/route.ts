import { createClient } from "@/lib/server";
import { createOpenRouterEmbedding, toPgVectorLiteral } from "@/app/lib/knowledge";

async function getAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await getAuth();
  if (!user) return Response.json({ files: [] }, { status: 401 });

  const { data, error } = await supabase
    .from("knowledge_files")
    .select("id, file_name, mime_type, file_size, status, chunk_count, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ files: [], error: error.message }, { status: 500 });
  }
  return Response.json({ files: data ?? [] });
}

export async function DELETE(req: Request) {
  const { supabase, user } = await getAuth();
  if (!user) return Response.json({ ok: false }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const fileId = searchParams.get("id");
  if (!fileId) return Response.json({ ok: false, error: "Missing file id" }, { status: 400 });

  const { data: fileData, error: fileError } = await supabase
    .from("knowledge_files")
    .select("id, bucket_path")
    .eq("id", fileId)
    .eq("user_id", user.id)
    .single();

  if (fileError || !fileData) {
    return Response.json({ ok: false, error: "File not found" }, { status: 404 });
  }

  try {
    const storage = (supabase as unknown as { storage?: { from: (bucket: string) => { remove: (paths: string[]) => Promise<{ error?: { message?: string } | null }> } } }).storage;
    if (storage?.from) {
      await storage.from("knowledge").remove([fileData.bucket_path]);
    }
  } catch {
    // Storage cleanup best effort only.
  }

  await supabase
    .from("knowledge_files")
    .delete()
    .eq("id", fileId)
    .eq("user_id", user.id);

  return Response.json({ ok: true });
}

export async function POST(req: Request) {
  const { supabase, user } = await getAuth();
  if (!user) return Response.json({ ok: false }, { status: 401 });

  const body = await req.json().catch(() => ({})) as { fileId?: string };
  if (!body.fileId) return Response.json({ ok: false, error: "Missing fileId" }, { status: 400 });

  await supabase
    .from("knowledge_files")
    .update({ status: "processing", error_message: null })
    .eq("id", body.fileId)
    .eq("user_id", user.id);

  const { data: chunks, error } = await supabase
    .from("knowledge_chunks")
    .select("id, content")
    .eq("user_id", user.id)
    .eq("file_id", body.fileId)
    .order("chunk_index", { ascending: true });

  if (error || !chunks) {
    await supabase
      .from("knowledge_files")
      .update({ status: "error", error_message: error?.message ?? "Failed to read chunks" })
      .eq("id", body.fileId)
      .eq("user_id", user.id);
    return Response.json({ ok: false, error: error?.message ?? "Failed to read chunks" }, { status: 500 });
  }

  try {
    for (const chunk of chunks as Array<{ id: string; content: string }>) {
      const embedding = await createOpenRouterEmbedding(chunk.content);
      await supabase
        .from("knowledge_chunks")
        .update({ embedding: toPgVectorLiteral(embedding) })
        .eq("id", chunk.id)
        .eq("user_id", user.id);
    }
    await supabase
      .from("knowledge_files")
      .update({ status: "ready", chunk_count: chunks.length, error_message: null })
      .eq("id", body.fileId)
      .eq("user_id", user.id);
    return Response.json({ ok: true, reindexed: chunks.length });
  } catch (reindexError) {
    await supabase
      .from("knowledge_files")
      .update({ status: "error", error_message: (reindexError as Error).message.slice(0, 500) })
      .eq("id", body.fileId)
      .eq("user_id", user.id);
    return Response.json({ ok: false, error: (reindexError as Error).message }, { status: 500 });
  }
}
