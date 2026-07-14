// Shared helpers for the waitlist: privacy-safe display name, Discord webhook,
// private notification email, Supabase client, and the confirmation email.
// Used by both /api/waitlist (signup) and /api/waitlist/confirm.
import nodemailer from "nodemailer";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const NOTIFY_EMAIL = process.env.WAITLIST_NOTIFY_EMAIL || "wiktorskrabel89@gmail.com";
const MILESTONES = new Set([10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]);

/** True when double opt-in (email confirmation) is enabled AND a sender is configured. */
export function doubleOptInEnabled(): boolean {
  return process.env.WAITLIST_DOUBLE_OPTIN === "true" && Boolean(process.env.RESEND_API_KEY);
}

/** Public display name: first name + initials — "Zuzanna Wachskrabel" → "Zuzanna W." */
export function publicName(name: string): string {
  const words = String(name || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Someone";
  const [first, ...rest] = words;
  const initials = rest.map((w) => `${w[0].toUpperCase()}.`).join(" ");
  return initials ? `${first} ${initials}` : first;
}

/**
 * Supabase client for the waitlist RPCs. Prefers the service-role key but the
 * anon/publishable key (always present) is enough — the RPCs are SECURITY DEFINER.
 */
export function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { persistSession: false } });
}

/** Discord webhook: masked-free — shortened name + live total + host, never the email. */
export async function sendDiscord(name: string, total: number, host: string): Promise<boolean> {
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

/** Private notification email to the owner (full details), if Gmail is configured. */
export async function sendOwnerEmail(name: string, email: string, total: number): Promise<boolean> {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return false;
  const transporter = nodemailer.createTransport({ service: "gmail", auth: { user, pass } });
  await transporter.sendMail({
    from: `"Jarvis Waitlist" <${user}>`,
    to: NOTIFY_EMAIL,
    subject: `🚀 Waitlist signup #${total}: ${name || email}`,
    text: `New waitlist signup #${total}\n\nName: ${name || "—"}\nEmail: ${email}\nTotal: ${total}\nTime: ${new Date().toISOString()}`,
    html: `<h2>New waitlist signup #${total}</h2><p><b>Name:</b> ${name || "—"}<br/><b>Email:</b> ${email}<br/><b>Total:</b> ${total}</p>`,
  });
  return true;
}

/**
 * Confirmation ("please confirm") email via Resend. Returns true on success.
 * Uses Resend's REST API directly (no SDK dependency).
 */
export async function sendConfirmationEmail(email: string, name: string, token: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM || "AssistantX <onboarding@resend.dev>";
  const base = (process.env.WAITLIST_PUBLIC_URL || "https://assistantx.pl").replace(/\/$/, "");
  const link = `${base}/api/waitlist/confirm?token=${encodeURIComponent(token)}`;
  const first = publicName(name).split(" ")[0];

  const html = `
  <div style="background:#050508;padding:40px 0;font-family:-apple-system,Segoe UI,Roboto,sans-serif">
    <div style="max-width:480px;margin:0 auto;background:#0a0a12;border:1px solid rgba(255,255,255,0.08);border-radius:24px;padding:40px;color:#fff">
      <div style="width:56px;height:56px;border-radius:16px;background:linear-gradient(135deg,#7c3aed,#2563eb);display:flex;align-items:center;justify-content:center;margin-bottom:24px;font-weight:900;font-size:22px;color:#fff;text-align:center;line-height:56px">X</div>
      <h1 style="font-size:24px;font-weight:800;margin:0 0 12px">Confirm your spot${first && first !== "Someone" ? `, ${first}` : ""}</h1>
      <p style="color:rgba(255,255,255,0.6);font-size:15px;line-height:1.6;margin:0 0 28px">
        You're almost on the AssistantX-Jarvis waitlist. Tap the button below to confirm this email — it's the last step.
      </p>
      <a href="${link}" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;font-weight:600;font-size:15px;padding:14px 28px;border-radius:12px">Confirm my spot →</a>
      <p style="color:rgba(255,255,255,0.3);font-size:12px;line-height:1.6;margin:28px 0 0">
        If you didn't sign up, just ignore this email — nothing will happen and you won't be added.
      </p>
    </div>
  </div>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Confirm your AssistantX-Jarvis waitlist spot",
      html,
      text: `Confirm your AssistantX-Jarvis waitlist spot: ${link}\n\nIf you didn't sign up, ignore this email.`,
    }),
  });
  if (!res.ok) {
    console.error("[waitlist] Resend send failed:", res.status, (await res.text()).slice(0, 200));
    return false;
  }
  return true;
}
