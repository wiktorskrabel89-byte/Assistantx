// app/api/jarvis/linked-accounts/github/route.ts
// GitHub OAuth initiation, callback handling, and proxy for Jarvis desktop.
// DELETE removes the linked account.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/server';

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID ?? '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET ?? '';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

// POST /api/jarvis/linked-accounts/github/initiate — returns { authUrl }
// POST /api/jarvis/linked-accounts/github/callback  — exchanges code for token
// POST /api/jarvis/linked-accounts/github/proxy     — proxies GitHub API calls
// DELETE /api/jarvis/linked-accounts/github          — unlinks GitHub
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const actionFromQuery = url.searchParams.get('action');
  let action: string;
  let cachedBody: Record<string, unknown> | null = null;

  if (actionFromQuery) {
    action = actionFromQuery;
  } else {
    cachedBody = await req.json().catch(() => ({})) as Record<string, unknown>;
    action = (cachedBody.action as string) || '';
  }

  const getBody = async (): Promise<Record<string, unknown>> => {
    if (cachedBody !== null) return cachedBody;
    cachedBody = await req.json().catch(() => ({})) as Record<string, unknown>;
    return cachedBody;
  };

  // ── Initiate OAuth ────────────────────────────────────────────────────────
  if (action === 'initiate') {
    if (!GITHUB_CLIENT_ID) {
      return NextResponse.json({ error: 'GitHub OAuth not configured' }, { status: 503 });
    }
    const state = Buffer.from(JSON.stringify({ userId: user.id, ts: Date.now() })).toString('base64url');
    const scopes = 'repo,read:user,user:email,gist';
    const authUrl = `https://github.com/login/oauth/authorize?client_id=${GITHUB_CLIENT_ID}&scope=${encodeURIComponent(scopes)}&state=${state}&redirect_uri=${encodeURIComponent(`${APP_URL}/api/jarvis/linked-accounts/github?action=callback`)}`;
    return NextResponse.json({ authUrl });
  }

  // ── OAuth callback — exchange code for token ──────────────────────────────
  if (action === 'callback') {
    const body = await getBody();
    const code = body.code as string | undefined;
    if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 });

    const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, client_secret: GITHUB_CLIENT_SECRET, code }),
    });
    const tokenData = await tokenRes.json() as { access_token?: string; scope?: string; error?: string };
    if (!tokenData.access_token) {
      return NextResponse.json({ error: tokenData.error || 'GitHub OAuth failed' }, { status: 400 });
    }

    // Fetch GitHub user info
    const ghUserRes = await fetch('https://api.github.com/user', {
      headers: { Authorization: `Bearer ${tokenData.access_token}`, 'User-Agent': 'AssistantX-Jarvis' },
    });
    const ghUser = await ghUserRes.json() as { login?: string; name?: string; avatar_url?: string };

    await supabase.from('jarvis_linked_accounts').upsert({
      user_id: user.id,
      provider: 'github',
      label: ghUser.login || 'GitHub',
      access_token: tokenData.access_token,
      scope: tokenData.scope,
      metadata: { login: ghUser.login, name: ghUser.name, avatar_url: ghUser.avatar_url },
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,provider' });

    return NextResponse.json({ ok: true, login: ghUser.login });
  }

  // ── Proxy GitHub API calls ────────────────────────────────────────────────
  if (action === 'proxy') {
    const body = await getBody();
    const { path: ghPath, method = 'GET', body: proxyBody } = body as {
      path?: string; method?: string; body?: unknown;
    };
    if (!ghPath) return NextResponse.json({ error: 'Missing path' }, { status: 400 });

    const { data: linked } = await supabase
      .from('jarvis_linked_accounts')
      .select('access_token')
      .eq('user_id', user.id)
      .eq('provider', 'github')
      .single();

    if (!linked?.access_token) {
      return NextResponse.json({ error: 'GitHub not linked' }, { status: 403 });
    }

    const apiRes = await fetch(`https://api.github.com${ghPath}`, {
      method,
      headers: {
        Authorization: `Bearer ${linked.access_token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'AssistantX-Jarvis',
        'Content-Type': 'application/json',
      },
      body: proxyBody ? JSON.stringify(proxyBody) : undefined,
    });

    const data = await apiRes.json();
    return NextResponse.json(data, { status: apiRes.status });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}

// GET /api/jarvis/linked-accounts/github?action=callback — browser-based OAuth redirect
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const APP_URL_SAFE = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  if (code) {
    // Redirect to a page that can call the callback action with the code
    return NextResponse.redirect(
      `${APP_URL_SAFE}/jarvis/linked-accounts?provider=github&code=${encodeURIComponent(code)}`,
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
    .eq('provider', 'github');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
