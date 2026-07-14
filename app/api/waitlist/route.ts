import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { createHash } from "crypto";
import {
  doubleOptInEnabled,
  getSupabaseClient,
  sendDiscord,
  sendOwnerEmail,
  sendConfirmationEmail,
} from "@/app/lib/waitlist-notify";

// Waitlist signups (POST { name?, email }):
//  - persisted via the public.waitlist_join() SECURITY DEFINER RPC (works with
//    the public anon key; table stays locked so emails are never readable).
//  - Direct mode (default): row is confirmed immediately → Discord notified.
//  - Double opt-in mode (WAITLIST_DOUBLE_OPTIN=true + RESEND_API_KEY): row is
//    'pending', a confirmation email is sent, and Discord fires only after the
//    visitor clicks the confirm link (/api/waitlist/confirm). This stops anyone
//    from squatting on someone else's address.
//  - Anti-abuse: hashed-IP rate limit (in the RPC) + honeypot field.

const DATA_FILE = path.join(process.cwd(), "data", "waitlist.json");

type Entry = { name: string; email: string; at: string };
type StoreResult = {
  stored: boolean;
  duplicate: boolean;
  alreadyConfirmed: boolean;
  rateLimited: boolean;
  total: number;
  token: string | null;
};

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

/** Salted hash of the submitter IP for rate limiting — the raw IP is never stored. */
function hashIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for") || "";
  const ip = fwd.split(",")[0].trim() || req.headers.get("x-real-ip") || "";
  if (!ip) return null;
  const salt = process.env.WAITLIST_IP_SALT || "assistantx-waitlist-static-salt";
  return createHash("sha256").update(`${salt}:${ip}`).digest("hex");
}

async function storeInSupabase(
  name: string,
  email: string,
  ipHash: string | null,
  requireConfirm: boolean,
): Promise<StoreResult | null> {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase.rpc("waitlist_join", {
    p_email: email,
    p_name: name || null,
    p_source: "landing",
    p_ip_hash: ipHash,
    p_confirm: requireConfirm,
  });

  if (error) {
    console.error("[waitlist] supabase waitlist_join failed:", error.message);
    return null;
  }

  const row = Array.isArray(data) ? data[0] : data;
  return {
    total: Number(row?.total ?? 0),
    duplicate: Boolean(row?.is_duplicate),
    alreadyConfirmed: Boolean(row?.already_confirmed),
    rateLimited: Boolean(row?.rate_limited),
    token: row?.token ?? null,
    stored: !row?.is_duplicate && !row?.rate_limited,
  };
}

/** Dev/self-hosted fallback when Supabase isn't configured. Direct mode only. */
async function storeInFile(name: string, email: string): Promise<StoreResult> {
  let entries: Entry[] = [];
  try {
    const raw = await fs.readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    entries = Array.isArray(parsed) ? parsed : [];
  } catch {
    entries = [];
  }
  if (entries.some((e) => e.email === email)) {
    return { stored: false, duplicate: true, alreadyConfirmed: true, rateLimited: false, total: entries.length, token: null };
  }
  entries.push({ name, email, at: new Date().toISOString() });
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(entries, null, 2), "utf8");
  } catch (err) {
    console.error("[waitlist] could not persist signup:", err instanceof Error ? err.message : err);
  }
  return { stored: true, duplicate: false, alreadyConfirmed: false, rateLimited: false, total: entries.length, token: null };
}

export async function POST(request: Request) {
  let body: { name?: string; email?: string; website?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  // Honeypot: real users never fill "website"; bots fill everything.
  if (typeof body.website === "string" && body.website.trim() !== "") {
    return NextResponse.json({ ok: true, delivered: false, total: 0 });
  }

  const name = (body.name || "").toString().trim().slice(0, 100);
  const email = (body.email || "").toString().trim().toLowerCase().slice(0, 200);
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "invalid email" }, { status: 400 });
  }

  const confirmMode = doubleOptInEnabled();
  const ipHash = hashIp(request);
  const result =
    (await storeInSupabase(name, email, ipHash, confirmMode)) ??
    (await storeInFile(name, email));

  if (result.rateLimited) {
    return NextResponse.json(
      { ok: false, rateLimited: true, error: "Too many signups from here — please try again later." },
      { status: 429 },
    );
  }

  // ── Double opt-in: send a confirmation email; Discord fires on confirm. ──
  if (confirmMode) {
    if (result.alreadyConfirmed) {
      return NextResponse.json({ ok: true, alreadyConfirmed: true, total: result.total });
    }
    // Fresh signup OR pending duplicate → (re)send the confirmation email.
    if (result.token) {
      const sent = await sendConfirmationEmail(email, name, result.token).catch((e) => {
        console.error("[waitlist] confirmation email error:", e?.message);
        return false;
      });
      return NextResponse.json({ ok: true, pendingConfirmation: true, emailSent: sent });
    }
    return NextResponse.json({ ok: true, pendingConfirmation: true, emailSent: false });
  }

  // ── Direct mode: confirmed immediately → notify Discord. ──
  if (result.duplicate) {
    return NextResponse.json({ ok: true, delivered: true, total: result.total, duplicate: true });
  }

  const host = request.headers.get("host") || "unknown";
  const results = await Promise.allSettled([
    sendDiscord(name, result.total, host),
    sendOwnerEmail(name, email, result.total),
  ]);
  const delivered = results.some((r) => r.status === "fulfilled" && r.value === true);
  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason?.message || r.reason).slice(0, 200));
  if (failures.length) console.error("[waitlist] delivery failures:", failures);

  return NextResponse.json({ ok: true, delivered, total: result.total });
}
