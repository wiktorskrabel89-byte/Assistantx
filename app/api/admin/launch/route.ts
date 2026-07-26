import { NextResponse } from "next/server";
import { getAdminSession, logAdmin } from "@/app/lib/admin-session";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";
import { sendLaunch } from "@/app/lib/admin-launch";

async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) return null;
  return session;
}

// POST body:
//   { action: "create", name, subject, body_html, body_text? }
//   { action: "send",   launchId, confirm: "SEND" }
//   { action: "cancel", launchId }
export async function POST(req: Request) {
  const session = await requireAdmin();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }
  const action = String(body.action || "");

  const supabase = getServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase-not-configured" }, { status: 500 });

  if (action === "create") {
    const name = String(body.name || "").trim();
    const subject = String(body.subject || "").trim();
    const html = String(body.body_html || "").trim();
    const text = String(body.body_text || "").trim() || null;
    if (!name || !subject || !html) {
      return NextResponse.json({ ok: false, error: "missing-fields" }, { status: 400 });
    }
    const { data, error } = await supabase
      .from("admin_launches")
      .insert({ name, subject, body_html: html, body_text: text, status: "draft" })
      .select("id, name")
      .single();
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await logAdmin("launch.created", { sessionId: session.id, target: data.id as string, metadata: { name: data.name } });
    return NextResponse.json({ ok: true, launch: data });
  }

  if (action === "send") {
    const launchId = String(body.launchId || "");
    const confirm = String(body.confirm || "");
    if (!launchId) return NextResponse.json({ ok: false, error: "missing-launch-id" }, { status: 400 });
    if (confirm !== "SEND") return NextResponse.json({ ok: false, error: "confirmation-required" }, { status: 400 });
    await logAdmin("launch.send.requested", { sessionId: session.id, target: launchId });
    try {
      const result = await sendLaunch(launchId);
      await logAdmin("launch.sent", { sessionId: session.id, target: launchId, metadata: result });
      return NextResponse.json({ ok: true, result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "send-failed";
      await logAdmin("launch.send.failed", { sessionId: session.id, target: launchId, metadata: { error: msg } });
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }
  }

  if (action === "cancel") {
    const launchId = String(body.launchId || "");
    if (!launchId) return NextResponse.json({ ok: false, error: "missing-launch-id" }, { status: 400 });
    const { error } = await supabase
      .from("admin_launches")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", launchId)
      .in("status", ["draft", "scheduled"]);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
    await logAdmin("launch.cancelled", { sessionId: session.id, target: launchId });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, error: "unknown-action" }, { status: 400 });
}
