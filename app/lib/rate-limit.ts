import "server-only";
import { createHash } from "crypto";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export function hashIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  if (!ip) return null;
  const salt = process.env.RATE_LIMIT_SALT || process.env.WAITLIST_IP_SALT || "assistantx-rl-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * Minute-window sliding-ish limiter. Increments a bucket keyed by
 * (scope, ip_hash, minute) and returns true iff the caller is still
 * under the budget. If Supabase isn't reachable, fails open (returns
 * true) — analytics tracking is not worth 500-ing over.
 */
export async function allowRequest(
  scope: string,
  req: Request,
  perMinuteLimit: number,
): Promise<boolean> {
  const supabase = getServiceRoleClient();
  const ipHash = hashIp(req);
  if (!supabase || !ipHash) return true;

  const now = new Date();
  const windowStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), now.getUTCMinutes()),
  ).toISOString();

  try {
    const { data, error } = await supabase.rpc("rate_limit_hit", {
      p_scope: scope,
      p_ip_hash: ipHash,
      p_window: windowStart,
    });
    if (error) return true;
    return (Number(data) ?? 0) <= perMinuteLimit;
  } catch {
    return true;
  }
}
