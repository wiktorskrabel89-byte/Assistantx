// jarvis/desktop/accounts.js
// Manages the Jarvis desktop account session (AssistantX / Supabase auth)
// and the list of linked third-party accounts (GitHub, Gmail, Google Drive, etc.).

'use strict';

const { clearProfileCache, getProfileBundle } = require('./electron/auth/profile');
const { clearSession, getCachedSession, loadSession, saveSession, toSafeSessionView } = require('./electron/auth/session');
const {
  AUTH_FAILURE,
  REFRESH_BUFFER_SECONDS,
  classifyAuthFailure,
  decodeJwtPayload,
  isTokenExpired,
} = require('./electron/auth/validators');
const { emitSessionChanged, emitSignedOut } = require('./electron/auth/events');

// ── Linked accounts (cached in memory) ───────────────────────────────────────
// Fetched from the cloud API; never stored locally for security.

let _linkedAccountsCache = null;
let _lastAuthFailure = null;

// Extracts the Supabase project base URL from the JWT iss claim.
// iss is normally "https://<project>.supabase.co/auth/v1".
function getSupabaseAuthBaseUrl(accessToken) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload?.iss) return null;
  try {
    const url = new URL(payload.iss);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function setLastAuthFailure(classification, detail = null) {
  _lastAuthFailure = {
    classification,
    detail,
    at: new Date().toISOString(),
  };
}

function getLastAuthFailure() {
  return _lastAuthFailure ? { ..._lastAuthFailure } : null;
}

function getAccountSession() {
  return getCachedSession();
}

function getSafeAccountSession() {
  return toSafeSessionView(getAccountSession());
}

async function setAccountSession(session, meta = {}) {
  const saved = await saveSession(session);
  setLastAuthFailure(null);
  emitSessionChanged(saved, meta);
  return saved;
}

async function clearAccountSession(meta = {}) {
  _linkedAccountsCache = null;
  clearProfileCache();
  await clearSession();
  emitSignedOut(meta);
}

function getLinkedAccounts() {
  return _linkedAccountsCache || [];
}

async function fetchLinkedAccounts(apiUrl, accessToken) {
  if (!apiUrl || !accessToken) return [];
  try {
    const response = await fetch(`${apiUrl}/api/jarvis/linked-accounts`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) return [];
    const data = await response.json();
    _linkedAccountsCache = Array.isArray(data.accounts) ? data.accounts : [];
    return _linkedAccountsCache;
  } catch (err) {
    console.warn('[accounts] fetchLinkedAccounts failed:', err?.message || err);
    return [];
  }
}

async function linkAccount(apiUrl, accessToken, provider) {
  if (!apiUrl || !accessToken) throw new Error('Not signed in');
  const res = await fetch(`${apiUrl}/api/jarvis/linked-accounts/${provider}/initiate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) throw new Error(`Failed to initiate ${provider} link (HTTP ${res.status})`);
  return res.json();
}

async function unlinkAccount(apiUrl, accessToken, provider) {
  if (!apiUrl || !accessToken) throw new Error('Not signed in');
  const res = await fetch(`${apiUrl}/api/jarvis/linked-accounts/${provider}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Failed to unlink ${provider} (HTTP ${res.status})`);
  _linkedAccountsCache = (_linkedAccountsCache || []).filter((a) => a.provider !== provider);
  return true;
}

async function githubRequest(apiUrl, accessToken, ghPath, options = {}) {
  const res = await fetch(`${apiUrl}/api/jarvis/linked-accounts/github/proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ path: ghPath, method: options.method || 'GET', body: options.body }),
  });
  if (!res.ok) throw new Error(`GitHub proxy error: HTTP ${res.status}`);
  return res.json();
}

async function gmailRequest(apiUrl, accessToken, action, params = {}) {
  const res = await fetch(`${apiUrl}/api/jarvis/linked-accounts/google/gmail-proxy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ action, ...params }),
  });
  if (!res.ok) throw new Error(`Gmail proxy error: HTTP ${res.status}`);
  return res.json();
}

async function refreshAccountSession(session) {
  const activeSession = session || getAccountSession();
  const { accessToken, refreshToken } = activeSession || {};
  if (!refreshToken) {
    setLastAuthFailure(AUTH_FAILURE.INVALID_REFRESH, 'Missing refresh token');
    return null;
  }
  const supabaseBase = getSupabaseAuthBaseUrl(accessToken);
  if (!supabaseBase) {
    setLastAuthFailure(AUTH_FAILURE.UNKNOWN, 'Missing Supabase base URL');
    return null;
  }

  try {
    const response = await fetch(`${supabaseBase}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      const classification = classifyAuthFailure({ status: response.status });
      setLastAuthFailure(classification, `Refresh returned HTTP ${response.status}`);
      if (classification !== AUTH_FAILURE.OFFLINE && classification !== AUTH_FAILURE.SUPABASE_OUTAGE) {
        console.warn('[accounts] Supabase token refresh returned HTTP', response.status);
      }
      return null;
    }

    const data = await response.json();
    if (!data?.access_token) {
      setLastAuthFailure(AUTH_FAILURE.UNKNOWN, 'Refresh response missing access token');
      return null;
    }

    const jwtPayload = decodeJwtPayload(data.access_token);
    setLastAuthFailure(null);
    return {
      version: 2,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      email: jwtPayload?.email || activeSession?.email || '',
      userId: jwtPayload?.sub || activeSession?.userId || '',
      signedInAt: activeSession?.signedInAt || new Date().toISOString(),
    };
  } catch (err) {
    const classification = classifyAuthFailure({ error: err });
    setLastAuthFailure(classification, err?.message || String(err));
    if (classification !== AUTH_FAILURE.OFFLINE) {
      console.warn('[accounts] Token refresh failed:', err?.message || err);
    }
    return null;
  }
}

async function refreshSessionIfNeeded(options = {}) {
  const { force = false, reason = 'refresh' } = options;
  const session = getAccountSession();
  if (!session?.accessToken) return null;
  if (!force && !isTokenExpired(session.accessToken, REFRESH_BUFFER_SECONDS)) return session;

  const refreshed = await refreshAccountSession(session);
  if (refreshed) {
    await setAccountSession(refreshed, { reason });
    return refreshed;
  }

  const classification = getLastAuthFailure()?.classification;
  if (classification === AUTH_FAILURE.OFFLINE || classification === AUTH_FAILURE.SUPABASE_OUTAGE) {
    return session;
  }

  console.warn('[accounts] Refresh failed; clearing login state.', classification || 'unknown');
  await clearAccountSession({ reason: classification || 'refresh-failed' });
  return null;
}

async function revokeAccountSession() {
  const session = getAccountSession();
  if (!session?.accessToken) return { ok: true, revoked: false, reason: 'not-signed-in' };
  const supabaseBase = getSupabaseAuthBaseUrl(session.accessToken);
  if (!supabaseBase) return { ok: false, revoked: false, reason: 'missing-supabase-url' };

  try {
    const response = await fetch(`${supabaseBase}/auth/v1/logout`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        apikey: session.accessToken,
      },
      signal: AbortSignal.timeout(10_000),
    });
    return { ok: response.ok, revoked: response.ok, status: response.status };
  } catch (error) {
    const classification = classifyAuthFailure({ error });
    setLastAuthFailure(classification, error?.message || String(error));
    console.warn('[accounts] Logout revoke failed:', error?.message || error);
    return { ok: false, revoked: false, reason: classification };
  }
}

async function signOutAccountSession(meta = {}) {
  const revokeResult = await revokeAccountSession();
  await clearAccountSession(meta);
  return revokeResult;
}

async function getAccountProfile(options = {}) {
  const session = getAccountSession();
  if (!session?.accessToken) return null;
  const supabaseBase = getSupabaseAuthBaseUrl(session.accessToken);
  if (!supabaseBase) return null;
  return getProfileBundle({
    supabaseUrl: supabaseBase,
    accessToken: session.accessToken,
    userId: session.userId,
    forceRefresh: Boolean(options.forceRefresh),
  });
}

module.exports = {
  clearAccountSession,
  decodeJwtPayload,
  fetchLinkedAccounts,
  getAccountProfile,
  getAccountSession,
  getLastAuthFailure,
  getLinkedAccounts,
  getSafeAccountSession,
  getSupabaseAuthBaseUrl,
  githubRequest,
  gmailRequest,
  isTokenExpired,
  linkAccount,
  loadAccountSession: loadSession,
  refreshAccountSession,
  refreshSessionIfNeeded,
  revokeAccountSession,
  setAccountSession,
  signOutAccountSession,
  unlinkAccount,
};
