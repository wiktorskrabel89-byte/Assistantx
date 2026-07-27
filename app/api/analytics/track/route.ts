import { NextResponse } from "next/server";
import { logEvent } from "@/app/lib/analytics-events";
import { allowRequest } from "@/app/lib/rate-limit";

// Public tracking endpoint. Rate-limited per-IP (60/min) so a malicious
// client can't fill analytics_events with junk. Event name capped at 120
// chars, properties treated as opaque, IPs hashed before storage.
// Fire-and-forget — the response never leaks limit info.
export async function POST(req: Request) {
  const ok = await allowRequest("analytics.track", req, 60);
  if (!ok) {
    // Silent success — bots won't get feedback that they've been throttled.
    return NextResponse.json({ ok: true });
  }

  let body: {
    name?: string;
    anonymous_id?: string;
    source?: string;
    properties?: Record<string, unknown>;
  } = {};
  try {
    body = await req.json();
  } catch {
    /* ignore */
  }

  await logEvent({
    name: String(body.name || ""),
    anonymousId: body.anonymous_id ?? null,
    source: body.source ?? "web",
    properties: body.properties && typeof body.properties === "object" ? body.properties : {},
    request: req,
  });

  return NextResponse.json({ ok: true });
}
