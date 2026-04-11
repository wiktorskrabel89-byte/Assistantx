import { createClient } from "@/lib/server";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("chat_history")
      .select("*")
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;
    return Response.json({ messages: data ?? [] });
  } catch {
    return Response.json({ messages: [] });
  }
}

export async function POST(req: Request) {
  try {
    const { user, ai, model, imageUrl } = await req.json();
    const supabase = await createClient();
    const { error } = await supabase.from("chat_history").insert({
      user_message: user,
      ai_message: ai,
      model,
      image_url: imageUrl ?? null,
    });

    if (error) throw error;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false });
  }
}

export async function DELETE() {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("chat_history").delete().neq("id", 0);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false });
  }
}
