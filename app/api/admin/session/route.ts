import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  ADMIN_COOKIE_NAME,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSession,
  destroyAdminSession,
  getAdminSession,
  logAdmin,
  verifyAccessCode,
} from "@/app/lib/admin-session";

// POST /api/admin/session — verify code, mint session, set cookie.
export async function POST(req: Request) {
  let body: { code?: string } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  const code = String(body.code || "").trim();
  if (!verifyAccessCode(code)) {
    // Same-shape 401 whether the code was wrong or unset — no info leak.
    await logAdmin("login.failed", { metadata: { reason: "bad-code" } });
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const created = await createAdminSession();
  if ("error" in created) {
    return NextResponse.json({ ok: false, error: created.error }, { status: 500 });
  }

  const res = NextResponse.json({ ok: true, redirect: "/admin/dashboard" });
  res.cookies.set({
    name: ADMIN_COOKIE_NAME,
    value: created.token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });

  await logAdmin("login.ok", { sessionId: created.sessionId });
  return res;
}

// DELETE /api/admin/session — server-side logout: remove row + clear cookie.
export async function DELETE() {
  const session = await getAdminSession();
  if (session) {
    await destroyAdminSession(session.id);
    await logAdmin("logout", { sessionId: session.id });
  }
  const store = await cookies();
  store.delete(ADMIN_COOKIE_NAME);
  return NextResponse.json({ ok: true });
}
