import { NextResponse } from "next/server";
import { getAdminSession, logAdmin } from "@/app/lib/admin-session";
import { deleteAuthUser } from "@/app/lib/admin-auth-users";

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

  const result = await deleteAuthUser(id);
  await logAdmin(result.ok ? "auth_user.deleted" : "auth_user.delete.failed", {
    sessionId: session.id,
    target: id,
    metadata: result.ok ? {} : { error: result.error || "unknown" },
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error || "delete-failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
