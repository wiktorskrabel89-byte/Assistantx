import { createClient } from "@/lib/server";
import { NextRequest } from "next/server";

async function getAuthenticatedUser(req: NextRequest) {
  const supabase = await createClient();
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabase.auth.getUser(token);
    if (data.user) return { supabase, user: data.user };
  }
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

/** GET /api/website-creator/projects/[id] */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getAuthenticatedUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("website_creator_projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .single();

  if (error || !data) return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json({ project: data });
}

/** PATCH /api/website-creator/projects/[id] */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getAuthenticatedUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Only allow updating safe fields
  const allowed: Record<string, unknown> = {};
  const patchableFields = ["name", "html", "css", "js", "status", "live_url", "northflank_service_id", "cloudflare_record_id"] as const;
  for (const field of patchableFields) {
    if (field in body) allowed[field] = body[field];
  }
  allowed.updated_at = new Date().toISOString();

  const { data, error } = await supabase
    .from("website_creator_projects")
    .update(allowed)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error || !data) return Response.json({ error: error?.message ?? "Not found" }, { status: 404 });
  return Response.json({ project: data });
}

/** DELETE /api/website-creator/projects/[id] */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { supabase, user } = await getAuthenticatedUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("website_creator_projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
