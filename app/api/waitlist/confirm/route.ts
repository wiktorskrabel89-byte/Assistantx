import { NextResponse } from "next/server";
import { getSupabaseClient, sendDiscord, sendOwnerEmail } from "@/app/lib/waitlist-notify";

// GET /api/waitlist/confirm?token=<uuid>
// The visitor lands here from the confirmation email. Flips their row to
// 'confirmed', fires the Discord notification (only now does it count toward
// the total), and returns a themed HTML page. Idempotent: a second click just
// says "already confirmed".

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function page(title: string, message: string, tone: "ok" | "info" | "error") {
  const color = tone === "error" ? "#dc5050" : tone === "info" ? "#7850dc" : "#50dc78";
  const icon = tone === "error" ? "✕" : tone === "info" ? "✓" : "✓";
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>${title} · AssistantX-Jarvis</title></head>
  <body style="margin:0;background:#050508;color:#fff;font-family:-apple-system,Segoe UI,Roboto,sans-serif;min-height:100vh;display:flex;align-items:center;justify-content:center">
    <div style="max-width:440px;margin:24px;background:#0a0a12;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:44px;text-align:center">
      <div style="width:64px;height:64px;border-radius:50%;background:${color}22;color:${color};display:flex;align-items:center;justify-content:center;font-size:30px;margin:0 auto 20px;line-height:64px">${icon}</div>
      <h1 style="font-size:24px;font-weight:800;margin:0 0 10px">${title}</h1>
      <p style="color:rgba(255,255,255,0.55);font-size:15px;line-height:1.6;margin:0 0 28px">${message}</p>
      <a href="/" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 26px;border-radius:12px">Back to AssistantX</a>
    </div>
  </body></html>`;
}

function html(body: string, status = 200) {
  return new NextResponse(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") || "";
  if (!UUID_RE.test(token)) {
    return html(page("Invalid link", "This confirmation link is malformed. Try signing up again.", "error"), 400);
  }

  const supabase = getSupabaseClient();
  if (!supabase) {
    return html(page("Something went wrong", "We couldn't reach the waitlist right now. Please try again shortly.", "error"), 500);
  }

  const { data, error } = await supabase.rpc("waitlist_confirm", { p_token: token });
  if (error) {
    console.error("[waitlist] confirm RPC failed:", error.message);
    return html(page("Something went wrong", "We couldn't confirm your spot right now. Please try again shortly.", "error"), 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  const ok = Boolean(row?.ok);
  const already = Boolean(row?.already);
  const total = Number(row?.total ?? 0);
  const name = String(row?.display_name || "");

  if (!ok) {
    return html(page("Link expired", "This confirmation link is no longer valid. Please sign up again.", "error"), 410);
  }
  if (already) {
    return html(page("Already confirmed", "You're already on the waitlist — nothing more to do. We'll be in touch.", "info"));
  }

  // Freshly confirmed → now it counts: notify Discord + owner.
  const host = request.headers.get("host") || "assistantx.pl";
  await Promise.allSettled([sendDiscord(name, total, host), sendOwnerEmail(name, "(confirmed)", total)]);

  return html(page("You're on the list! 🎉", "Your spot is confirmed. You'll be among the first to get AssistantX-Jarvis.", "ok"));
}
