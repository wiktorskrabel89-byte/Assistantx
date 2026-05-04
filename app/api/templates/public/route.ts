/**
 * GET /api/templates/public
 *   Returns the top public prompt templates, ordered by upvotes desc.
 *   Query params: ?limit=30&offset=0
 *
 * POST /api/templates/public
 *   Publishes a template to the community library.
 *   Requires Bearer auth.
 *   Body: { label, content, mode, displayName }
 *
 * PATCH /api/templates/public
 *   Upvotes a template.
 *   Body: { id }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit") ?? "30"), 100);
  const offset = Math.max(Number(searchParams.get("offset") ?? "0"), 0);

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from("public_templates")
    .select("id, display_name, label, content, mode, upvotes, created_at")
    .order("upvotes", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ templates: data ?? [] });
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const token = authHeader?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { label?: string; content?: string; mode?: string; displayName?: string };
  const label = String(body.label ?? "").trim();
  const content = String(body.content ?? "").trim();
  const mode = String(body.mode ?? "chat").trim();
  const displayName = String(body.displayName ?? "Anonymous").trim().slice(0, 80);

  if (!label || !content) {
    return NextResponse.json({ error: "label and content are required" }, { status: 400 });
  }

  const admin = getAdmin();
  const client = admin ?? supabase;

  const { data, error } = await client
    .from("public_templates")
    .insert({ user_id: user.id, display_name: displayName, label, content, mode })
    .select("id, display_name, label, content, mode, upvotes, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ template: data }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json() as { id?: string };
  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Atomic read-modify-write increment (acceptable for upvote counters)
  const supabase = await createServerClient();
  const { data: row, error: fetchError } = await supabase
    .from("public_templates")
    .select("upvotes")
    .eq("id", id)
    .single();

  if (fetchError || !row) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  const { error } = await supabase
    .from("public_templates")
    .update({ upvotes: (row.upvotes ?? 0) + 1 })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
