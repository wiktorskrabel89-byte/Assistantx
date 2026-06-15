import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { checkRateLimit, getRateLimitKey, rateLimitedResponse } from "@/lib/rateLimit";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  const rateLimitKey = getRateLimitKey(req, "waitlist");
  const rateLimit = checkRateLimit(rateLimitKey, 5, 10 * 60_000);
  if (!rateLimit.allowed) {
    return rateLimitedResponse(rateLimit.retryAfterMs);
  }

  let body: { email?: unknown; language?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request body." }, { status: 400 });
  }

  const email = String(body.email ?? "").trim().toLowerCase();
  const language = typeof body.language === "string" ? body.language.slice(0, 8) : null;

  if (!email || email.length > 254 || !EMAIL_REGEX.test(email)) {
    return NextResponse.json({ ok: false, error: "Invalid email address." }, { status: 400 });
  }

  const admin = getAdmin();
  if (!admin) {
    return NextResponse.json({ ok: false, error: "Waitlist is not configured." }, { status: 503 });
  }

  const { error } = await admin.from("waitlist_signups").insert({
    email,
    language,
    source: "assistantx-waitlist-subdomain",
  });

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    console.error("POST /api/waitlist error:", error);
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 500 });
  }

  return NextResponse.json({ ok: true, duplicate: false });
}
