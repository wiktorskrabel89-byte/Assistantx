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
  } catch {
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

module.exports = {
  clearAccountSession,
  fetchLinkedAccounts,
  getAccountSession,
  getLinkedAccounts,
  githubRequest,
  gmailRequest,
  linkAccount,
  setAccountSession,
  unlinkAccount,
};
