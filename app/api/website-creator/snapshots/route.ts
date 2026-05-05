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

/** GET /api/website-creator/snapshots?projectId=xxx
 *  Returns the 20 most recent snapshots (metadata only) for the project. */
export async function GET(req: NextRequest) {
  const { supabase, user } = await getUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "Missing projectId" }, { status: 400 });

  const { data, error } = await supabase
    .from("website_creator_snapshots")
    .select("id, label, created_at")
    .eq("project_id", projectId)
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ snapshots: data ?? [] });
}

/** POST /api/website-creator/snapshots — save a new version snapshot */
export async function POST(req: NextRequest) {
  const { supabase, user } = await getUser(req);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  let body: {
    projectId?: string;
    html?: string;
    css?: string;
    js?: string;
    pages?: unknown[];
    label?: string;
  };
  try {
    body = await req.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { projectId, html = "", css = "", js = "", pages = [], label } = body;
  if (!projectId) return Response.json({ error: "Missing projectId" }, { status: 400 });

  // Verify the project belongs to this user before inserting
  const { data: project, error: projectError } = await supabase
    .from("website_creator_projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (projectError || !project) {
    return Response.json({ error: "Project not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("website_creator_snapshots")
    .insert({ project_id: projectId, user_id: user.id, html, css, js, pages, label })
    .select("id, label, created_at")
    .single();

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ snapshot: data }, { status: 201 });
}
