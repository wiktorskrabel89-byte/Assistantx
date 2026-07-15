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

/**
 * Public display name for Discord:
 *  - "Zuzanna Wachskrabel" → "Zuzanna W." (first name + initials, privacy)
 *  - "wiktor.skrabel"      → "Wiktor S."  (dots/underscores count as separators)
 *  - "kubasiu"             → "Kubasiu"    (single word shown in FULL, not initials)
 */
export function publicName(name: string): string {
  const words = String(name || "").split(/[\s._-]+/).filter(Boolean);
  if (words.length === 0) return "Someone";
  const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
  const [first, ...rest] = words;
  const initials = rest.map((w) => `${w[0].toUpperCase()}.`).join(" ");
  return initials ? `${cap(first)} ${initials}` : cap(first);
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
 * Confirmation ("please confirm") email via Resend. Table-based layout with
 * a PNG logo — email clients (Gmail especially) ignore flexbox and block SVG,
 * so everything here is old-school HTML that renders identically everywhere.
 */
export async function sendConfirmationEmail(email: string, name: string, token: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return false;
  const from = process.env.RESEND_FROM || "AssistantX <onboarding@resend.dev>";
  const base = (process.env.WAITLIST_PUBLIC_URL || "https://assistantx.pl").replace(/\/$/, "");
  const link = `${base}/api/waitlist/confirm?token=${encodeURIComponent(token)}`;
  const logo = `${base}/media/email-logo.png`;

  // Greeting name: first word, Title Case, letters only — "wiktor.skrabel"
  // → "Wiktor". Falls back to no name at all rather than something ugly.
  const rawFirst = (String(name || "").trim().split(/[\s._-]+/)[0] || "").replace(/[^\p{L}]/gu, "");
  const first = rawFirst ? rawFirst[0].toUpperCase() + rawFirst.slice(1).toLowerCase() : "";
  const greeting = first ? `Confirm your spot, ${first}` : "Confirm your spot";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<meta name="supported-color-schemes" content="dark"/>
<title>${greeting}</title>
</head>
<body style="margin:0;padding:0;background-color:#050508;">
  <!-- preheader: shows as the preview line in the inbox, invisible in the body -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    One tap and you're officially on the AssistantX-Jarvis waitlist.&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#050508;">
    <tr><td align="center" style="padding:48px 16px;">

      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;background-color:#0b0b13;border:1px solid #23233a;border-radius:24px;">
        <tr><td align="center" style="padding:44px 40px 40px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

          <!-- logo -->
          <img src="${logo}" width="56" height="56" alt="AssistantX-Jarvis" style="display:block;border:0;outline:none;margin:0 auto 26px;"/>

          <!-- eyebrow -->
          <p style="margin:0 0 10px;font-size:11px;font-weight:700;letter-spacing:3px;color:#8b7cf6;text-transform:uppercase;">
            AssistantX&#8209;Jarvis&nbsp;&nbsp;·&nbsp;&nbsp;Waitlist
          </p>

          <!-- heading -->
          <h1 style="margin:0 0 14px;font-size:26px;line-height:1.25;font-weight:800;color:#ffffff;">
            ${greeting}
          </h1>

          <!-- copy -->
          <p style="margin:0 auto 32px;max-width:380px;font-size:15px;line-height:1.65;color:#9b9bb0;">
            You're one tap away from the AI Operating System.
            Confirm this email address to lock in your place in line.
          </p>

          <!-- button (bulletproof: solid bg + padding on the <a> itself) -->
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
            <tr><td align="center" style="border-radius:14px;background-color:#7c3aed;background-image:linear-gradient(90deg,#8b5cf6,#4f46e5);">
              <a href="${link}"
                 style="display:inline-block;padding:16px 42px;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;">
                Confirm my spot&nbsp;&nbsp;&#8594;
              </a>
            </td></tr>
          </table>

          <!-- fallback link -->
          <p style="margin:30px 0 0;font-size:12px;line-height:1.6;color:#55556a;">
            Button not working? Paste this link into your browser:<br/>
            <a href="${link}" style="color:#8b7cf6;text-decoration:underline;word-break:break-all;">${link}</a>
          </p>

          <!-- divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="padding:30px 0 22px;"><div style="height:1px;line-height:1px;font-size:0;background-color:#1d1d30;">&nbsp;</div></td></tr>
          </table>

          <p style="margin:0;font-size:12px;line-height:1.6;color:#55556a;">
            Didn't sign up? Just ignore this email — you won't be added and nothing else will happen.
          </p>

        </td></tr>
      </table>

      <!-- footer -->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:520px;">
        <tr><td align="center" style="padding:22px 10px 0;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <p style="margin:0;font-size:11px;line-height:1.7;color:#3d3d52;">
            AssistantX&#8209;Jarvis · The AI Operating System<br/>
            <a href="${base}" style="color:#55556a;text-decoration:none;">assistantx.pl</a>
          </p>
        </td></tr>
      </table>

    </td></tr>
  </table>
</body>
</html>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Confirm your AssistantX-Jarvis waitlist spot",
      html,
      text: `${greeting}\n\nYou're one tap away from the AI Operating System. Confirm this email to lock in your place in line:\n\n${link}\n\nDidn't sign up? Ignore this email — you won't be added.\n\nAssistantX-Jarvis · assistantx.pl`,
    }),
  });
  if (!res.ok) {
    console.error("[waitlist] Resend send failed:", res.status, (await res.text()).slice(0, 200));
    return false;
  }
  return true;
}
