import { createClient } from "@/lib/server";

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return { supabase, user: data.user };
}

export async function GET() {
  try {
    const { supabase, user } = await getAuthenticatedClient();
    if (!user) {
      return Response.json({ messages: [] }, { status: 401 });
    }
    const { data, error } = await supabase
      .from("chat_history")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(100);

    if (error) throw error;
    return Response.json({ messages: data ?? [] });
  } catch (err) {
    console.error("GET chat-history error:", err);
    return Response.json({ messages: [] });
  }
}

export async function POST(req: Request) {
  try {
    const { user, ai, model, imageUrl } = await req.json();
    const { supabase, user: currentUser } = await getAuthenticatedClient();
    if (!currentUser) {
      return Response.json({ ok: false }, { status: 401 });
    }
    const { error } = await supabase.from("chat_history").insert({
      user_id: currentUser.id,
      user_message: user,
      ai_message: ai,
      model,
      image_url: imageUrl ?? null,
    });

    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    console.error("POST chat-history error:", err);
    return Response.json({ ok: false });
  }
}

export async function DELETE() {
  try {
    const { supabase, user } = await getAuthenticatedClient();
    if (!user) {
      return Response.json({ ok: false }, { status: 401 });
    }
    const { error } = await supabase.from("chat_history").delete().eq("user_id", user.id);
    if (error) throw error;
    return Response.json({ ok: true });
  } catch (err) {
    console.error("DELETE chat-history error:", err);
    return Response.json({ ok: false });
  }
}
