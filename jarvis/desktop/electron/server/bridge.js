'use strict';

const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const runtimeConfig = require('../../runtime-config');

const AUTH_FILE_NAME = 'server-auth.dat';

function createServerBridge() {
  const authFilePath = path.join(app.getPath('userData'), AUTH_FILE_NAME);
  let _cachedAuth = null;

  function canEncrypt() {
    return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
  }

  function readAuth() {
    if (_cachedAuth) return { ..._cachedAuth };
    try {
      if (!fs.existsSync(authFilePath)) return null;
      const payload = fs.readFileSync(authFilePath, 'utf8').trim();
      if (!payload) return null;
      if (!canEncrypt()) return null;
      const decrypted = safeStorage.decryptString(Buffer.from(payload, 'base64'));
      const parsed = JSON.parse(String(decrypted || '{}'));
      _cachedAuth = {
        syncKey: typeof parsed.syncKey === 'string' ? parsed.syncKey : null,
        sessionToken: typeof parsed.sessionToken === 'string' ? parsed.sessionToken : null,
        fullControlConsent: Boolean(parsed.fullControlConsent),
        permissionLevel: ['default', 'auto', 'full'].includes(parsed.permissionLevel) ? parsed.permissionLevel : 'default',
      };
      return { ..._cachedAuth };
    } catch {
      return null;
    }
  }

  function writeAuth(next) {
    _cachedAuth = {
      syncKey: typeof next.syncKey === 'string' ? next.syncKey : null,
      sessionToken: typeof next.sessionToken === 'string' ? next.sessionToken : null,
      fullControlConsent: Boolean(next.fullControlConsent),
      permissionLevel: ['default', 'auto', 'full'].includes(next.permissionLevel) ? next.permissionLevel : 'default',
    };
    if (!canEncrypt()) {
      return { ok: false, reason: 'safeStorage-encryption-unavailable' };
    }
    try {
      const encrypted = safeStorage.encryptString(JSON.stringify(_cachedAuth));
      fs.writeFileSync(authFilePath, encrypted.toString('base64'), 'utf8');
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: String(error?.message || error) };
    }
  }

  function clearAuth() {
    _cachedAuth = null;
    try {
      if (fs.existsSync(authFilePath)) fs.unlinkSync(authFilePath);
      return { ok: true };
    } catch (error) {
      return { ok: false, reason: String(error?.message || error) };
    }
  }

  async function request(pathname, options = {}) {
    const baseUrl = runtimeConfig.getRemoteRuntimeApiUrl();
    const url = `${baseUrl}${pathname}`;
    const auth = readAuth() || {};
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (auth.sessionToken) {
      headers.Authorization = `Bearer ${auth.sessionToken}`;
    }
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { ok: false, status: response.status, error: payload?.error || `Request failed (${response.status})` };
    }
    return { ok: true, status: response.status, payload };
  }

  async function verifyPairing(syncKey) {
    const key = String(syncKey || '').trim();
    if (!key) return { ok: false, error: 'sync-key-required' };
    const result = await request('/v1/pair/verify', {
      method: 'POST',
      body: { syncKey: key },
      headers: {},
    });
    if (!result.ok) return result;
    const sessionToken = String(result.payload?.sessionToken || '').trim();
    if (!sessionToken) return { ok: false, error: 'pairing-session-missing' };
    const existing = readAuth() || {};
    const saved = writeAuth({
      ...existing,
      syncKey: key,
      sessionToken,
      permissionLevel: existing.permissionLevel || 'default',
      fullControlConsent: Boolean(existing.fullControlConsent),
    });
    if (!saved.ok) return saved;
    return {
      ok: true,
      sessionToken,
      expiresAt: result.payload?.expiresAt || null,
      permissionLevel: existing.permissionLevel || 'default',
    };
  }

  async function getRuntimeStatus() {
    const result = await request('/v1/runtime/status', { method: 'GET' });
    if (!result.ok) return result;
    return {
      ok: true,
      ...result.payload,
    };
  }

  async function setPermissionLevel(level, fullControlConsent = false) {
    const normalizedLevel = ['default', 'auto', 'full'].includes(level) ? level : 'default';
    const consent = Boolean(fullControlConsent);
    const result = await request('/v1/runtime/permissions', {
      method: 'POST',
      body: { level: normalizedLevel, fullControlConsent: consent },
    });
    if (!result.ok) return result;
    const existing = readAuth() || {};
    writeAuth({
      ...existing,
      permissionLevel: normalizedLevel,
      fullControlConsent: consent || existing.fullControlConsent,
    });
    return { ok: true, permissionLevel: normalizedLevel };
  }

  async function killSwitch() {
    const result = await request('/v1/runtime/kill-switch', { method: 'POST', body: {} });
    clearAuth();
    return result.ok ? { ok: true } : result;
  }

  function getAuthStatus() {
    const auth = readAuth();
    return {
      ok: true,
      encryptedStorage: canEncrypt(),
      paired: Boolean(auth?.sessionToken),
      hasSyncKey: Boolean(auth?.syncKey),
      permissionLevel: auth?.permissionLevel || 'default',
      fullControlConsent: Boolean(auth?.fullControlConsent),
    };
  }

  function getConfig() {
    return {
      runtimeMode: runtimeConfig.getRuntimeMode(),
      remoteRuntimeApiUrl: runtimeConfig.getRemoteRuntimeApiUrl(),
      remoteRuntimeWsUrl: runtimeConfig.getRemoteRuntimeWsUrl(),
    };
  }

  function setConfig(patch = {}) {
    const mode = runtimeConfig.setRuntimeMode(patch.runtimeMode);
    const apiUrl = runtimeConfig.setRemoteRuntimeApiUrl(patch.remoteRuntimeApiUrl);
    const wsUrl = runtimeConfig.setRemoteRuntimeWsUrl(patch.remoteRuntimeWsUrl);
    return { ok: true, runtimeMode: mode, remoteRuntimeApiUrl: apiUrl, remoteRuntimeWsUrl: wsUrl };
  }

  return {
    clearAuth,
    getAuthStatus,
    getConfig,
    getRuntimeStatus,
    killSwitch,
    setConfig,
    setPermissionLevel,
    verifyPairing,
  };
}

module.exports = {
  createServerBridge,
};
