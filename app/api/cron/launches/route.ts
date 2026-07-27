import { NextResponse } from "next/server";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";
import { sendLaunch } from "@/app/lib/admin-launch";
import { logAdmin } from "@/app/lib/admin-session";

// Vercel Cron target. Vercel signs cron requests with the header
// x-vercel-cron-signature — but for the MVP we accept the Authorization
// header with a shared CRON_SECRET so it's callable from anywhere (and
// still safe).
function isAuthorized(req: Request): boolean {
  const auth = req.headers.get("authorization") || "";
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;
  return auth === `Bearer ${expected}`;
}

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const supabase = getServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ ok: false, error: "supabase-not-configured" }, { status: 500 });
  }

  const nowIso = new Date().toISOString();
  const { data: due, error } = await supabase
    .from("admin_launches")
    .select("id, name")
    .eq("status", "scheduled")
    .not("scheduled_for", "is", null)
    .lte("scheduled_for", nowIso);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const results: Array<{ id: string; name: string; ok: boolean; error?: string }> = [];
  for (const row of (due ?? []) as { id: string; name: string }[]) {
    try {
      const r = await sendLaunch(row.id);
      await logAdmin("launch.sent.cron", { target: row.id, metadata: { name: row.name, ...r } });
      results.push({ id: row.id, name: row.name, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "send-failed";
      await logAdmin("launch.send.cron_failed", { target: row.id, metadata: { name: row.name, error: msg } });
      results.push({ id: row.id, name: row.name, ok: false, error: msg });
    }
  }

  return NextResponse.json({ ok: true, ran: results });
}

// Vercel Cron will also POST; accept both.
export const POST = GET;
