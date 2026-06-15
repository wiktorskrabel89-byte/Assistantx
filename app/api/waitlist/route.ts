/**
 * POST /api/waitlist
 *
 * Public signup endpoint for the AssistantX waitlist landing page
 * (/waitlist, served from the assistantx-waitlist subdomain).
 *
 * Body: { email: string, locale?: string, source?: string }
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY so the insert can bypass RLS
 * (table public.waitlist_signups has no public policies).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({})) as {
    email?: string;
    locale?: string;
    source?: string;
  };

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!email || !EMAIL_PATTERN.test(email) || email.length > 320) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const locale = String(body.locale ?? "").trim().slice(0, 8) || null;
  const source = String(body.source ?? "waitlist").trim().slice(0, 64) || "waitlist";

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Waitlist signups are not configured." }, { status: 503 });
  }

  const { error } = await supabase
    .from("waitlist_signups")
    .insert({ email, locale, source });

  if (error) {
    // Unique violation -> already on the list, treat as success.
    if (error.code === "23505") {
      return NextResponse.json({ ok: true, alreadySubscribed: true });
    }
    return NextResponse.json({ error: "Could not save your email. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
