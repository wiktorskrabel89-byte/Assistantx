import { NextResponse } from "next/server";
import { getAdminSession, logAdmin } from "@/app/lib/admin-session";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

// POST { action: "delete", id }
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  const action = String(body.action || "");
  if (action !== "delete") {
    return NextResponse.json({ ok: false, error: "unknown-action" }, { status: 400 });
  }
  const id = String(body.id || "").trim();
  if (!id) return NextResponse.json({ ok: false, error: "missing-id" }, { status: 400 });

  const supabase = getServiceRoleClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "supabase-not-configured" }, { status: 500 });

  // Look up the email first so we can log a hash of it — the audit log
  // never stores the raw address.
  const { data: existing } = await supabase
    .from("waitlist_signups")
    .select("email")
    .eq("id", id)
    .maybeSingle();

  const { error } = await supabase.from("waitlist_signups").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  await logAdmin("waitlist.deleted", {
    sessionId: session.id,
    target: id,
    metadata: existing?.email ? { email_domain: String(existing.email).split("@")[1] || null } : {},
  });

  return NextResponse.json({ ok: true });
}
