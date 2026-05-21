'use strict';

const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

const TOKEN_FILE = 'google-token.bin';
const DEVICE_CODE_URL = 'https://oauth2.googleapis.com/device/code';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
];

function createGoogleAuth({ app, clientId, clientSecret }) {
  if (!app || typeof app.getPath !== 'function') throw new Error('electron-app-required');
  const tokenPath = path.join(app.getPath('userData'), TOKEN_FILE);
  const oauthClientId = String(clientId || process.env.GOOGLE_DESKTOP_CLIENT_ID || '').trim();
  const oauthClientSecret = String(clientSecret || process.env.GOOGLE_DESKTOP_CLIENT_SECRET || '').trim();

  function ensureAuthConfig() {
    if (!oauthClientId || !oauthClientSecret) {
      throw new Error('google-oauth-client-not-configured');
    }
  }

  function ensureSafeStorageAvailable() {
    if (!safeStorage || !safeStorage.isEncryptionAvailable()) {
      throw new Error('safeStorage-encryption-unavailable');
    }
  }

  async function postForm(url, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error_description || data?.error || `google-http-${response.status}`);
    }
    return data;
  }

  function saveTokens(tokens) {
    ensureSafeStorageAvailable();
    const encrypted = safeStorage.encryptString(JSON.stringify(tokens || {}));
    fs.writeFileSync(tokenPath, encrypted.toString('base64'), 'utf8');
  }

  function readTokens() {
    ensureSafeStorageAvailable();
    if (!fs.existsSync(tokenPath)) return null;
    const encoded = String(fs.readFileSync(tokenPath, 'utf8') || '').trim();
    if (!encoded) return null;
    const decrypted = safeStorage.decryptString(Buffer.from(encoded, 'base64'));
    return JSON.parse(decrypted);
  }

  async function initiateDeviceFlow() {
    ensureAuthConfig();
    return postForm(DEVICE_CODE_URL, {
      client_id: oauthClientId,
      scope: DEFAULT_SCOPES.join(' '),
    });
  }

  async function pollForToken(deviceCode) {
    ensureAuthConfig();
    const data = await postForm(TOKEN_URL, {
      client_id: oauthClientId,
      client_secret: oauthClientSecret,
      device_code: String(deviceCode || ''),
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    });
    const now = Date.now();
    const persisted = {
      ...data,
      expires_at: now + (Number(data?.expires_in || 0) * 1000),
      updated_at: now,
    };
    saveTokens(persisted);
    return persisted;
  }

  async function refreshToken() {
    ensureAuthConfig();
    const current = readTokens();
    const refresh = String(current?.refresh_token || '').trim();
    if (!refresh) throw new Error('google-refresh-token-missing');
    const data = await postForm(TOKEN_URL, {
      client_id: oauthClientId,
      client_secret: oauthClientSecret,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    });
    const next = {
      ...current,
      ...data,
      refresh_token: refresh,
      expires_at: Date.now() + (Number(data?.expires_in || 0) * 1000),
      updated_at: Date.now(),
    };
    saveTokens(next);
    return next;
  }

  async function getAccessToken() {
    const current = readTokens();
    if (!current?.access_token) throw new Error('google-auth-required');
    if (Number(current?.expires_at || 0) - Date.now() > 30_000) return current.access_token;
    const refreshed = await refreshToken();
    return refreshed.access_token;
  }

  async function revokeAccess() {
    const current = readTokens();
    const token = String(current?.refresh_token || current?.access_token || '').trim();
    if (token) {
      await postForm(REVOKE_URL, { token }).catch(() => null);
    }
    if (fs.existsSync(tokenPath)) fs.unlinkSync(tokenPath);
    return { ok: true };
  }

  function getStatus() {
    try {
      const tokens = readTokens();
      return {
        connected: Boolean(tokens?.refresh_token || tokens?.access_token),
        expiresAt: tokens?.expires_at || null,
      };
    } catch (error) {
      return {
        connected: false,
        error: String(error?.message || error || 'google-status-failed'),
      };
    }
  }

  return {
    initiateDeviceFlow,
    pollForToken,
    refreshToken,
    revokeAccess,
    getAccessToken,
    getStatus,
  };
}

module.exports = {
  createGoogleAuth,
};
