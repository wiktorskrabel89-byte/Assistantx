import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";
import { makeUnsubscribeToken } from "@/app/lib/launch-email-template";
import { logEvent } from "@/app/lib/analytics-events";
import { allowRequest } from "@/app/lib/rate-limit";

function html(body: string, status = 200): NextResponse {
  return new NextResponse(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function page(title: string, message: string, tone: "ok" | "error"): string {
  const color = tone === "error" ? "#dc5050" : "#50dc78";
  const icon = tone === "error" ? "✕" : "✓";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title} · AssistantX</title></head>
  <body style="margin:0;background:#050508;color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center">
    <div style="max-width:440px;margin:24px;background:#0a0a12;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:44px;text-align:center">
      <div style="width:64px;height:64px;border-radius:50%;background:${color}22;color:${color};display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 20px;line-height:64px">${icon}</div>
      <h1 style="font-size:24px;font-weight:800;margin:0 0 10px">${title}</h1>
      <p style="color:rgba(255,255,255,0.55);font-size:15px;line-height:1.6;margin:0 0 28px">${message}</p>
      <a href="/" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:12px">Back to AssistantX</a>
    </div>
  </body></html>`;
}

function ipHashFromRequest(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  if (!ip) return null;
  const salt = process.env.WAITLIST_IP_SALT || "assistantx-unsubscribe-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

export async function GET(request: Request) {
  // 30 requests/min per IP — plenty for real users clicking, hostile
  // enough to make token brute-forcing pointless.
  if (!(await allowRequest("waitlist.unsubscribe", request, 30))) {
    return html(page("Slow down", "Too many requests from this address. Please wait a moment.", "error"), 429);
  }

  const url = new URL(request.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  const token = (url.searchParams.get("token") || "").trim();

  if (!email || !token) {
    return html(page("Invalid link", "This unsubscribe link is malformed.", "error"), 400);
  }
  const expected = makeUnsubscribeToken(email);
  if (token !== expected) {
    return html(page("Invalid link", "This unsubscribe link is invalid or has expired.", "error"), 400);
  }

  const supabase = getServiceRoleClient();
  if (!supabase) {
    return html(page("Try again shortly", "We couldn't process this request right now. Please try again.", "error"), 500);
  }

  await supabase.from("email_suppressions").upsert(
    {
      email,
      reason: "unsubscribe",
      ip_hash: ipHashFromRequest(request),
      user_agent: request.headers.get("user-agent")?.slice(0, 500) ?? null,
    },
    { onConflict: "email" },
  );

  await logEvent({
    name: "waitlist.unsubscribed",
    source: "email",
    properties: { email_domain: email.split("@")[1] ?? null },
    request,
  });

  return html(
    page(
      "You're unsubscribed",
      "You will no longer receive launch emails from AssistantX. Your waitlist row is unchanged — you can rejoin at any time from the homepage.",
      "ok",
    ),
  );
}
