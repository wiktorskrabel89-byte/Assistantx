import "server-only";
import { getServiceRoleClient } from "@/app/lib/supabase-admin";

const RESEND_URL = "https://api.resend.com/emails";

async function sendOne(opts: {
  from: string;
  to: string;
  subject: string;
  html: string;
  text?: string | null;
  apiKey: string;
}): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(RESEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${opts.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: opts.from,
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
      text: opts.text || undefined,
    }),
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).slice(0, 200);
    return { ok: false, error: `${res.status} ${body}` };
  }
  return { ok: true };
}

/**
 * Fetch a launch's target audience. For MVP we treat every launch as going
 * to confirmed waitlist rows only — never pending, never anonymous.
 */
async function getAudience(): Promise<string[]> {
  const supabase = getServiceRoleClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("waitlist_signups")
    .select("email, status")
    .in("status", ["confirmed"]) // hard-coded safety
    .limit(50_000);
  const rows = (data ?? []) as { email: string }[];
  const seen = new Set<string>();
  return rows
    .map((r) => r.email.trim().toLowerCase())
    .filter((e) => {
      if (!e || seen.has(e)) return false;
      seen.add(e);
      return true;
    });
}

export type SendResult = { total: number; ok: number; failed: number; lastError: string | null };

/**
 * Send a launch. Each recipient gets its own request — Resend never sees
 * multiple recipients in the "to" field, so nobody's email leaks to anyone
 * else. Slow but safe. Rate-limits itself with a small delay every 10 sends.
 */
export async function sendLaunch(launchId: string): Promise<SendResult> {
  const supabase = getServiceRoleClient();
  if (!supabase) throw new Error("supabase-not-configured");
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("resend-not-configured");

  const from = process.env.RESEND_FROM || "AssistantX <onboarding@resend.dev>";

  // Load launch + guard against double-send.
  const { data: launch, error: readErr } = await supabase
    .from("admin_launches")
    .select("id, name, subject, body_html, body_text, status")
    .eq("id", launchId)
    .single();
  if (readErr || !launch) throw new Error(readErr?.message || "launch-not-found");
  if (launch.status === "sending" || launch.status === "sent") {
    throw new Error(`already-${launch.status}`);
  }

  // Take a lock by transitioning to 'sending'. Optimistic — status is unique
  // per launch id so a concurrent request would still see the new value.
  await supabase.from("admin_launches").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", launchId);

  const recipients = await getAudience();
  await supabase.from("admin_launches").update({ recipient_total: recipients.length }).eq("id", launchId);

  let ok = 0;
  let failed = 0;
  let lastError: string | null = null;

  for (let i = 0; i < recipients.length; i++) {
    const to = recipients[i];
    const r = await sendOne({
      from,
      to,
      subject: launch.subject as string,
      html: launch.body_html as string,
      text: (launch.body_text as string | null) ?? null,
      apiKey,
    });
    if (r.ok) ok++;
    else {
      failed++;
      lastError = r.error ?? "unknown";
    }
    if ((i + 1) % 10 === 0) {
      await new Promise((res) => setTimeout(res, 500)); // gentle pacing
    }
  }

  await supabase
    .from("admin_launches")
    .update({
      status: failed === 0 ? "sent" : ok === 0 ? "failed" : "sent",
      sent_at: new Date().toISOString(),
      recipient_ok: ok,
      recipient_failed: failed,
      last_error: lastError,
      updated_at: new Date().toISOString(),
    })
    .eq("id", launchId);

  return { total: recipients.length, ok, failed, lastError };
}
