/**
 * Admin session — server-side only.
 *
 * Flow:
 *   1. Admin visits /admin, submits access code.
 *   2. /api/admin/session POST verifies the code (constant-time) against
 *      ADMIN_ACCESS_CODE env var.
 *   3. On success we mint a random 32-byte token, store SHA-256(token) in
 *      admin_sessions, and set an HttpOnly Secure SameSite=Lax cookie with
 *      the raw token.
 *   4. Every admin route calls `getAdminSession()` which reads the cookie,
 *      hashes it, and looks up an unexpired row. If missing/expired → null.
 *   5. Logout deletes the row and clears the cookie.
 *
 * We hash the token before storing so a DB leak alone can't grant access.
 * We use timingSafeEqual for the code compare so we don't leak length via
 * timing.
 */
import { cookies, headers } from "next/headers";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export const ADMIN_COOKIE_NAME = "assistantx-admin-session";
export const ADMIN_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h

export type AdminSession = {
  id: string;
  createdAt: string;
  expiresAt: string;
};

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function ipHashFromHeaders(hdrs: Headers): string | null {
  const fwd = hdrs.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || hdrs.get("x-real-ip") || "";
  if (!ip) return null;
  const salt = process.env.ADMIN_IP_SALT || process.env.WAITLIST_IP_SALT || "assistantx-admin-salt";
  return sha256Hex(`${salt}:${ip}`);
}

/** Constant-time compare of the submitted code against the configured value. */
export function verifyAccessCode(submitted: string): boolean {
  const expected = process.env.ADMIN_ACCESS_CODE;
  if (!expected || !submitted) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Create a new admin session. Persists the sha256 of the token and returns
 * the RAW token + row id so the API route can set the cookie.
 */
export async function createAdminSession(): Promise<
  | { token: string; sessionId: string; expiresAt: Date }
  | { error: string }
> {
  const supabase = getServiceRoleClient();
  if (!supabase) return { error: "supabase-not-configured" };

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = sha256Hex(rawToken);
  const expiresAt = new Date(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000);

  const hdrs = await headers();
  const ipHash = ipHashFromHeaders(hdrs);
  const userAgent = hdrs.get("user-agent")?.slice(0, 500) ?? null;

  const { data, error } = await supabase
    .from("admin_sessions")
    .insert({
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      ip_hash: ipHash,
      user_agent: userAgent,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { error: error?.message || "insert-failed" };
  }

  return { token: rawToken, sessionId: data.id as string, expiresAt };
}

/**
 * Return the current admin session (row) if the cookie is valid + unexpired.
 * Never throws.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!raw) return null;

  const supabase = getServiceRoleClient();
  if (!supabase) return null;

  const tokenHash = sha256Hex(raw);
  const { data, error } = await supabase
    .from("admin_sessions")
    .select("id, created_at, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) return null;

  return {
    id: data.id as string,
    createdAt: data.created_at as string,
    expiresAt: data.expires_at as string,
  };
}

/** Delete the session row so logout is real (invalidates the cookie server-side). */
export async function destroyAdminSession(sessionId: string): Promise<void> {
  const supabase = getServiceRoleClient();
  if (!supabase) return;
  await supabase.from("admin_sessions").delete().eq("id", sessionId);
}

/** Insert an audit log row. Never throws — audit failure must not break the action. */
export async function logAdmin(
  action: string,
  opts: { target?: string | null; metadata?: Record<string, unknown>; sessionId?: string | null } = {},
): Promise<void> {
  try {
    const supabase = getServiceRoleClient();
    if (!supabase) return;
    const hdrs = await headers();
    await supabase.from("admin_audit_logs").insert({
      actor: opts.sessionId || "admin",
      action,
      target: opts.target ?? null,
      metadata: opts.metadata ?? {},
      ip_hash: ipHashFromHeaders(hdrs),
      user_agent: hdrs.get("user-agent")?.slice(0, 500) ?? null,
    });
  } catch (err) {
    console.error("[admin] audit log insert failed", err);
  }
}
