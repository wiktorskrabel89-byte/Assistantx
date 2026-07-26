import { NextResponse } from "next/server";
import { logEvent } from "@/app/lib/analytics-events";

// Public tracking endpoint. Anyone can fire, but the event name is capped
// at 120 chars, properties are treated as an opaque object, and IPs are
// hashed. Never returns anything meaningful — analytics is fire-and-forget.
export async function POST(req: Request) {
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
