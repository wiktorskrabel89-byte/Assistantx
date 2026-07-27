import { NextResponse } from "next/server";
import { getAdminSession, logAdmin } from "@/app/lib/admin-session";
import { setSetting } from "@/app/lib/admin-settings";

// POST { key, value }
// Only lets known keys through so a compromised admin cookie can't stash
// arbitrary junk in the settings table.
const ALLOWED_KEYS = new Set(["launch_date"]);

export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });

  let body: { key?: string; value?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  const key = String(body.key || "");
  if (!ALLOWED_KEYS.has(key)) {
    return NextResponse.json({ ok: false, error: "unknown-key" }, { status: 400 });
  }

  const result = await setSetting(key, body.value ?? null);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || "save-failed" }, { status: 500 });
  }

  await logAdmin("settings.updated", {
    sessionId: session.id,
    target: key,
    metadata: { value: body.value },
  });
  return NextResponse.json({ ok: true });
}
