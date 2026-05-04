import { createClient } from "@/lib/server";
import { NextRequest } from "next/server";

async function getUser(req: NextRequest) {
  const supabase = await createClient();
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (token) {
    const { data } = await supabase.auth.getUser(token);
    if (data.user) return { supabase, user: data.user };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

/** GET /api/website-creator/snapshots/[id] — full snapshot content for restore */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("website_creator_snapshots")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ snapshot: data });
}

/** DELETE /api/website-creator/snapshots/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("website_creator_snapshots")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
