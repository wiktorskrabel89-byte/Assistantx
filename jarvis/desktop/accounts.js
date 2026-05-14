// jarvis/desktop/accounts.js
// Manages the Jarvis desktop account session (AssistantX / Supabase auth)
// and the list of linked third-party accounts (GitHub, Gmail, Google Drive, etc.).
//
// Sessions are persisted to Electron's store via the local-state mechanism.
// Linked account tokens are fetched from the cloud API and cached in memory
// (never written to disk — only the cloud-side encrypted store holds tokens).

const fs = require('fs');
const os = require('os');
const path = require('path');

const SESSION_FILE = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.config'),
  'JarvisDesktop',
  'session.json',
);

// ── JWT helpers ───────────────────────────────────────────────────────────────

// Decodes the base64url-encoded payload section of a JWT.
// Signature verification is intentionally omitted — the token is used only for
// reading claims (email, exp, iss) and authorization is enforced server-side.
function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

// Returns true when the access token's exp claim is within bufferSeconds of now.
function isTokenExpired(accessToken, bufferSeconds = 60) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload?.exp) return false; // cannot determine; treat as valid
  return Date.now() / 1000 >= payload.exp - bufferSeconds;
}

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

// ── Session persistence ───────────────────────────────────────────────────────

function ensureSessionDir() {
  const dir = path.dirname(SESSION_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function getAccountSession() {
  try {
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setAccountSession(session) {
  ensureSessionDir();
  fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2), 'utf-8');
}

function clearAccountSession() {
  try {
    fs.unlinkSync(SESSION_FILE);
  } catch { /* already gone */ }
  _linkedAccountsCache = null;
}

// ── Linked accounts (cached in memory) ───────────────────────────────────────
// Fetched from the cloud API; never stored locally for security.

let _linkedAccountsCache = null;

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

// ── OAuth actions ─────────────────────────────────────────────────────────────
// Ask the backend to initiate an OAuth flow for a given provider.
// The user completes it in a browser; the backend stores the resulting tokens.

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
  const data = await res.json();
  return data; // { authUrl: string }
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

// ── GitHub helpers ────────────────────────────────────────────────────────────
// Perform GitHub actions on behalf of the user using their linked token.

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

// ── Gmail helpers ─────────────────────────────────────────────────────────────

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

// Attempts to exchange the stored refresh token for a new access token via the
// Supabase auth REST API.  Returns the updated session object on success, or
// null if the refresh token is missing/invalid or the network call fails.
async function refreshAccountSession(session) {
  const { accessToken, refreshToken } = session;
  if (!refreshToken) return null;
  const supabaseBase = getSupabaseAuthBaseUrl(accessToken);
  if (!supabaseBase) return null;
  try {
    const response = await fetch(`${supabaseBase}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn('[accounts] Supabase token refresh returned HTTP', response.status);
      return null;
    }
    const data = await response.json();
    if (!data?.access_token) return null;
    const jwtPayload = decodeJwtPayload(data.access_token);
    return {
      ...session,
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      email: jwtPayload?.email || session.email || '',
      userId: jwtPayload?.sub || session.userId || '',
    };
  } catch (err) {
    console.warn('[accounts] Token refresh failed:', err?.message || err);
    return null;
  }
}

// Checks whether the stored session is expired and, if so, attempts a silent
// refresh.  If the refresh succeeds the new session is persisted and returned.
// If the refresh fails the expired session is cleared and null is returned.
// Returns the current session unchanged when it is not yet expired.
async function refreshSessionIfNeeded() {
  const session = getAccountSession();
  if (!session?.accessToken) return null;
  if (!isTokenExpired(session.accessToken)) return session;
  const refreshed = await refreshAccountSession(session);
  if (refreshed) {
    setAccountSession(refreshed);
    return refreshed;
  }
  console.warn('[accounts] Could not refresh expired session — clearing login state.');
  clearAccountSession();
  return null;
}

module.exports = {
  clearAccountSession,
  fetchLinkedAccounts,
  getAccountSession,
  getLinkedAccounts,
  githubRequest,
  gmailRequest,
  isTokenExpired,
  linkAccount,
  refreshSessionIfNeeded,
  setAccountSession,
  unlinkAccount,
};
