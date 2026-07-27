import "server-only";

/**
 * Wrap the admin-composed body_html in a proper branded email shell.
 *
 * Table-based layout because email clients (Gmail especially) mangle
 * flexbox/grid; safe fonts; inline styles; PNG logo (SVG is stripped by
 * most clients). Placeholders honoured:
 *   {{unsubscribe_url}} — replaced by the caller with a per-recipient link
 *   {{public_url}}      — replaced with the site's canonical URL
 */
export function wrapLaunchEmail({
  subject,
  bodyHtml,
  publicUrl,
  unsubscribeUrl,
}: {
  subject: string;
  bodyHtml: string;
  publicUrl: string;
  unsubscribeUrl: string;
}): string {
  const logoUrl = `${publicUrl.replace(/\/$/, "")}/media/email-logo.png`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;background:#050508;color:#e6e6ec;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#050508;">
    <tr>
      <td align="center" style="padding:32px 12px;">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;background:#0a0a12;border:1px solid rgba(255,255,255,0.08);border-radius:24px;overflow:hidden;">

          <!-- Header -->
          <tr>
            <td style="padding:32px 32px 8px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="vertical-align:middle;">
                    <img src="${logoUrl}" width="48" height="48" alt="AssistantX" style="display:block;border:0;outline:0;border-radius:12px;">
                  </td>
                  <td align="right" style="vertical-align:middle;">
                    <a href="${publicUrl}" style="color:#a5a5c0;text-decoration:none;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;">assistantx.pl</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body content — composed by the admin -->
          <tr>
            <td style="padding:20px 32px 8px;color:#e6e6ec;font-size:15px;line-height:1.65;">
              ${bodyHtml}
            </td>
          </tr>

          <!-- CTA row -->
          <tr>
            <td align="center" style="padding:16px 32px 32px;">
              <a href="${publicUrl}" style="display:inline-block;background:linear-gradient(90deg,#7c3aed,#2563eb);color:#fff;text-decoration:none;font-weight:700;font-size:14px;padding:12px 26px;border-radius:12px;">
                Open AssistantX
              </a>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 32px;">
              <div style="height:1px;background:rgba(255,255,255,0.06);"></div>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:20px 32px 28px;color:#7d7d95;font-size:11px;line-height:1.6;text-align:center;">
              You received this email because you joined the AssistantX waitlist at
              <a href="${publicUrl}" style="color:#a789f0;text-decoration:none;">assistantx.pl</a>.<br>
              <a href="${unsubscribeUrl}" style="color:#a789f0;text-decoration:none;">Unsubscribe</a>
              &nbsp;·&nbsp;
              <a href="${publicUrl}/privacy" style="color:#a789f0;text-decoration:none;">Privacy</a>
              &nbsp;·&nbsp;
              <a href="${publicUrl}/terms" style="color:#a789f0;text-decoration:none;">Terms</a>
              <br><br>
              &copy; ${new Date().getFullYear()} AssistantX. All rights reserved.
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Deterministic per-email unsubscribe token so recipients can unsubscribe
 * without exposing anything sensitive. We sign `email` with an HMAC keyed
 * by a server-side secret.
 */
import { createHmac } from "crypto";
export function makeUnsubscribeToken(email: string): string {
  const key =
    process.env.WAITLIST_UNSUB_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "assistantx-unsubscribe-fallback";
  return createHmac("sha256", key).update(email.toLowerCase()).digest("hex").slice(0, 24);
}
