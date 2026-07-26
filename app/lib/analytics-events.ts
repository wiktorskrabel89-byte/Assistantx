import "server-only";
import { createHash } from "crypto";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

export type LogEventOpts = {
  name: string;
  userId?: string | null;
  anonymousId?: string | null;
  source?: string | null;
  properties?: Record<string, unknown>;
  request?: Request; // to derive ip_hash + user_agent
};

function ipHashFromRequest(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  if (!ip) return null;
  const salt = process.env.ANALYTICS_IP_SALT || process.env.WAITLIST_IP_SALT || "assistantx-analytics-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

/**
 * Fire-and-forget event insert. Never throws — analytics must not break
 * whatever business action triggered it.
 */
export async function logEvent(opts: LogEventOpts): Promise<void> {
  try {
    const supabase = getServiceRoleClient();
    if (!supabase) return;
    const name = String(opts.name || "").trim().slice(0, 120);
    if (!name) return;

    const row = {
      event_name: name,
      user_id: opts.userId ?? null,
      anonymous_id: opts.anonymousId ?? null,
      source: opts.source ?? null,
      properties: opts.properties ?? {},
      ip_hash: opts.request ? ipHashFromRequest(opts.request) : null,
      user_agent: opts.request?.headers.get("user-agent")?.slice(0, 500) ?? null,
    };

    await supabase.from("analytics_events").insert(row);
  } catch (err) {
    console.error("[analytics] logEvent failed", err);
  }
}
