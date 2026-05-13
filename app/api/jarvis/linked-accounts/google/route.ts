// app/api/jarvis/linked-accounts/google/route.ts
// Google OAuth initiation, callback, and proxy for Gmail / Google Drive actions.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';
const REDIRECT_URI = `${APP_URL}/api/jarvis/linked-accounts/google?action=callback`;

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/drive',
].join(' ');

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  // Prefer query param for action (avoids consuming request body prematurely)
  const actionFromQuery = url.searchParams.get('action');
  let action: string;
  let cachedBody: Record<string, unknown> | null = null;

  if (actionFromQuery) {
    action = actionFromQuery;
  } else {
    cachedBody = await req.json().catch(() => ({})) as Record<string, unknown>;
    action = (cachedBody.action as string) || '';
  }

  // Helper to get body (uses cached value if already parsed)
  const getBody = async (): Promise<Record<string, unknown>> => {
    if (cachedBody !== null) return cachedBody;
    cachedBody = await req.json().catch(() => ({})) as Record<string, unknown>;
    return cachedBody;
  };

  // ── Initiate OAuth ────────────────────────────────────────────────────────
  if (action === 'initiate') {
    if (!GOOGLE_CLIENT_ID) {
      return NextResponse.json({ error: 'Google OAuth not configured' }, { status: 503 });
    }
    const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString('base64url');
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', GOOGLE_SCOPES);
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('state', state);
    return NextResponse.json({ authUrl: authUrl.toString() });
  }

  // ── Callback — exchange code for tokens ───────────────────────────────────
  if (action === 'callback') {
    const body = await getBody();
    const code = body.code as string | undefined;
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    const tokenData = await tokenRes.json() as {
      access_token?: string; refresh_token?: string; expires_in?: number;
      id_token?: string; scope?: string; error?: string;
    };
    if (!tokenData.access_token) {
      return NextResponse.json({ error: tokenData.error || 'Google OAuth failed' }, { status: 400 });
    }

    const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

    // Fetch Google user info
    const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const info = await infoRes.json() as { email?: string; name?: string; picture?: string };

    await supabase.from('jarvis_linked_accounts').upsert({
      user_id: user.id,
      provider: 'google',
      label: info.email || 'Google',
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token,
      scope: tokenData.scope,
      expires_at: expiresAt,
      metadata: { email: info.email, name: info.name, picture: info.picture },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });

    return NextResponse.json({ ok: true, email: info.email });
  }

  // ── Gmail proxy ───────────────────────────────────────────────────────────
  if (action === 'gmail-proxy') {
    const body = await getBody();
    const { action: gmailAction, to, subject, body: emailBody, messageId } = body as {
      action?: string; to?: string; subject?: string; body?: string; messageId?: string;
    };

    const linked = await getLinkedToken(supabase, user.id, 'google');
    if (!linked) return NextResponse.json({ error: 'Google not linked' }, { status: 403 });

    const token = await refreshGoogleTokenIfNeeded(supabase, user.id, linked);

    if (gmailAction === 'list') {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=10', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return NextResponse.json(await res.json(), { status: res.status });
    }

    if (gmailAction === 'send' && to && subject) {
      const { data: acct } = await supabase
        .from('jarvis_linked_accounts')
        .select('metadata')
        .eq('user_id', user.id)
        .eq('provider', 'google')
        .single();
      const fromEmail = (acct?.metadata as { email?: string } | null)?.email ?? '';
      const raw = makeRawEmail(fromEmail, to, subject, emailBody ?? '');
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ raw }),
      });
      return NextResponse.json(await res.json(), { status: res.status });
    }

    if (gmailAction === 'read' && messageId) {
      const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return NextResponse.json(await res.json(), { status: res.status });
    }

    return NextResponse.json({ error: 'Unknown Gmail action' }, { status: 400 });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const APP_URL_SAFE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  if (code) {
    return NextResponse.redirect(
      `${APP_URL_SAFE}/jarvis/linked-accounts?provider=google&code=${encodeURIComponent(code)}`,
    );
  }
  return NextResponse.json({ error: 'Missing code' }, { status: 400 });
}

export async function DELETE(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { error } = await supabase
    .from('jarvis_linked_accounts')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'google');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

async function getLinkedToken(
  supabase: SupabaseClient,
  userId: string,
  provider: string,
): Promise<{ access_token: string; refresh_token?: string; expires_at?: string } | null> {
  const { data } = await supabase
    .from('jarvis_linked_accounts')
    .select('access_token, refresh_token, expires_at')
    .eq('user_id', userId)
    .eq('provider', provider)
    .single();
  return data ?? null;
}

async function refreshGoogleTokenIfNeeded(
  supabase: SupabaseClient,
  userId: string,
  linked: { access_token: string; refresh_token?: string; expires_at?: string },
): Promise<string> {
  if (linked.expires_at && new Date(linked.expires_at).getTime() > Date.now() + 60_000) {
    return linked.access_token;
  }
  if (!linked.refresh_token) return linked.access_token;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: linked.refresh_token,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  const data = await tokenRes.json() as { access_token?: string; expires_in?: number };
  if (!data.access_token) return linked.access_token;

  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  await supabase
    .from('jarvis_linked_accounts')
    .update({ access_token: data.access_token, expires_at: expiresAt, updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('provider', 'google');

  return data.access_token;
}

function makeRawEmail(from: string, to: string, subject: string, body: string): string {
  const message = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    '',
    body,
  ].join('\r\n');
  return Buffer.from(message).toString('base64url');
}
