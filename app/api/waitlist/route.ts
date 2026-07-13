import { NextResponse } from "next/server";
import nodemailer from "nodemailer";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";

// Waitlist signups (POST { name?, email }):
//  - persisted to Supabase table public.waitlist_signups when the service-role
//    key is configured (survives serverless deploys); falls back to a local
//    git-ignored JSON file for dev/self-hosted runs
//  - Discord webhook notification WITHOUT the email address (privacy: emails
//    must never appear in a chat channel) — shortened name + live total + host
//  - full details (incl. email) go only to the private notification email
//    (WAITLIST_NOTIFY_EMAIL) once GMAIL_APP_PASSWORD is configured

const NOTIFY_EMAIL = process.env.WAITLIST_NOTIFY_EMAIL || "wiktorskrabel89@gmail.com";
const DATA_FILE = path.join(process.cwd(), "data", "waitlist.json");

type Entry = { name: string; email: string; at: string };
type StoreResult = { stored: boolean; duplicate: boolean; total: number };

function isValidEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

async function storeInSupabase(name: string, email: string): Promise<StoreResult | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { error } = await supabase
    .from("waitlist_signups")
    .insert({ email, name: name || null, source: "landing" });

  let duplicate = false;
  if (error) {
    if (error.code === "23505") {
      duplicate = true; // unique violation → already subscribed
    } else {
      // Table missing / transient failure — let the caller fall back.
      console.error("[waitlist] supabase insert failed:", error.message);
      return null;
    }
  }

  const { count, error: countError } = await supabase
    .from("waitlist_signups")
    .select("*", { count: "exact", head: true });
  if (countError) console.error("[waitlist] supabase count failed:", countError.message);

  return { stored: !duplicate, duplicate, total: count ?? 0 };
}

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
    return { stored: false, duplicate: true, total: entries.length };
  }

  entries.push({ name, email, at: new Date().toISOString() });
  try {
    await fs.mkdir(path.dirname(DATA_FILE), { recursive: true });
    await fs.writeFile(DATA_FILE, JSON.stringify(entries, null, 2), "utf8");
  } catch (err) {
    // Ephemeral/read-only filesystem — notifications must still go out.
    console.error("[waitlist] could not persist signup:", err instanceof Error ? err.message : err);
  }
  return { stored: true, duplicate: false, total: entries.length };
}

const MILESTONES = new Set([10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);

// Public display name for Discord: first name in full, remaining words as
// initials — "Zuzanna Wachskrabel" → "Zuzanna W." The site tells visitors
// this is what gets announced.
function publicName(name: string) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Someone";
  const [first, ...rest] = words;
  const initials = rest.map((w) => `${w[0].toUpperCase()}.`).join(" ");
  return initials ? `${first} ${initials}` : first;
}

async function sendDiscord(name: string, total: number, host: string) {
  const url = process.env.DISCORD_WEBHOOK_URL;
  if (!url) return false;

  const isMilestone = MILESTONES.has(total);
  const displayName = publicName(name);

  const embed = {
    title: isMilestone ? `🎉 MILESTONE — ${total} people on the waitlist!` : "🚀 New waitlist signup",
    description: isMilestone
      ? `**${displayName}** just became waitlister **#${total}**! The hype is real.`
      : `**${displayName}** just joined the waitlist.`,
    color: isMilestone ? 0x50dc78 : 0x7850dc,
    fields: [
      { name: "👤 Who", value: displayName, inline: true },
      { name: "👥 Total waitlisted", value: `**${total}**`, inline: true },
      { name: "🌐 From", value: host, inline: true },
    ],
    footer: { text: "AssistantX-Jarvis • waitlist" },
    timestamp: new Date().toISOString(),
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "Jarvis Waitlist", embeds: [embed] }),
  });
  return res.ok;
}

async function sendEmail(name: string, email: string, total: number) {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return false;
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  await transporter.sendMail({
    from: `"Jarvis Waitlist" <${user}>`,
    to: NOTIFY_EMAIL,
    subject: `🚀 Waitlist signup #${total}: ${name || email}`,
    text: `New waitlist signup #${total}\n\nName: ${name || "—"}\nEmail: ${email}\nTotal waitlisted: ${total}\nTime: ${new Date().toISOString()}`,
    html: `<h2>New waitlist signup #${total}</h2><p><b>Name:</b> ${name || "—"}<br/><b>Email:</b> ${email}<br/><b>Total waitlisted:</b> ${total}<br/><b>Time:</b> ${new Date().toISOString()}</p>`,
  });
  return true;
}

export async function POST(request: Request) {
  let body: { name?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid JSON" }, { status: 400 });
  }

  const name = (body.name || "").toString().trim().slice(0, 100);
  const email = (body.email || "").toString().trim().toLowerCase().slice(0, 200);
  if (!isValidEmail(email)) {
    return NextResponse.json({ ok: false, error: "invalid email" }, { status: 400 });
  }

  const result = (await storeInSupabase(name, email)) ?? (await storeInFile(name, email));

  // Same email twice → idempotent success, no duplicate notification spam.
  if (result.duplicate) {
    return NextResponse.json({ ok: true, delivered: true, total: result.total, duplicate: true });
  }

  const host = request.headers.get("host") || "unknown";
  const results = await Promise.allSettled([
    sendDiscord(name, result.total, host),
    sendEmail(name, email, result.total),
  ]);
  const delivered = results.some((r) => r.status === "fulfilled" && r.value === true);
  const failures = results
    .filter((r): r is PromiseRejectedResult => r.status === "rejected")
    .map((r) => String(r.reason?.message || r.reason).slice(0, 200));

  if (failures.length) console.error("[waitlist] delivery failures:", failures);
  if (!delivered) {
    console.warn(`[waitlist] signup #${result.total} stored but NOT delivered (configure GMAIL_APP_PASSWORD / DISCORD_WEBHOOK_URL)`);
  }

  return NextResponse.json({ ok: true, delivered, total: result.total });
}
