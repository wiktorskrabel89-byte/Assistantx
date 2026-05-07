import { createClient } from "@/lib/server";
import { NextRequest } from "next/server";

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as Record<string, unknown>)["code"];
  return typeof value === "string" ? value : null;
}

function isMissingTableError(error: unknown): boolean {
  const code = getErrorCode(error);
  const missingCodes = new Set(["42P01", "PGRST116", "PGRST200", "PGRST201", "PGRST202", "PGRST204", "PGRST205"]);
  if (code !== null && missingCodes.has(code)) return true;
  const msg = error instanceof Error ? error.message.toLowerCase() : "";
  return msg.includes("does not exist") || (msg.includes("website_creator_projects") && msg.includes("not found"));
}

async function getAuthenticatedUser(req: NextRequest) {
  const supabase = await createClient();
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const token = authHeader.replace("Bearer ", "");
    const { data } = await supabase.auth.getUser(token);
    if (data.user) return { supabase, user: data.user };
  }
  // Fall back to cookie-based session
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return { supabase, user: null };
  return { supabase, user: data.user };
}

/** GET /api/website-creator/projects — list all projects for the signed-in user */
export async function GET(req: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("website_creator_projects")
    .select("*")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[GET /api/website-creator/projects]", error);
    if (isMissingTableError(error)) {
      return Response.json({ projects: [], available: false, code: "website_creator_not_configured", error: "Website Creator is not configured. Run the website-creator migration in Supabase." }, { status: 503 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ projects: data ?? [] });
}

/** POST /api/website-creator/projects — create a new project */
export async function POST(req: NextRequest) {
  const { supabase, user } = await getAuthenticatedUser(req);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { name?: string; html?: string; css?: string; js?: string };
  try {
    body = await req.json() as typeof body;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { name = "Nowy projekt", html = "", css = "", js = "" } = body;

  const { data, error } = await supabase
    .from("website_creator_projects")
    .insert({
      user_id: user.id,
      name,
      html,
      css,
      js,
      status: "draft",
    })
    .select()
    .single();

  if (error) {
    console.error("[POST /api/website-creator/projects]", error);
    if (isMissingTableError(error)) {
      return Response.json({ code: "website_creator_not_configured", error: "Website Creator is not configured. Run the website-creator migration in Supabase." }, { status: 503 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ project: data }, { status: 201 });
}
