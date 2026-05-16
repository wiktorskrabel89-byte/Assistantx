'use strict';

const crypto = require('crypto');

const SESSION_VERSION = 2;
const REFRESH_BUFFER_SECONDS = 5 * 60;
const AUTH_FAILURE = {
  OFFLINE: 'offline',
  REVOKED: 'revoked',
  INVALID_REFRESH: 'invalid-refresh',
  SUPABASE_OUTAGE: 'supabase-outage',
  UNKNOWN: 'unknown',
};

function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function isTokenExpired(accessToken, bufferSeconds = REFRESH_BUFFER_SECONDS) {
  const payload = decodeJwtPayload(accessToken);
  if (!payload?.exp) return false;
  return Date.now() / 1000 >= payload.exp - bufferSeconds;
}

function normalizeSession(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const accessToken = typeof raw.accessToken === 'string' ? raw.accessToken.trim() : '';
  if (!accessToken) return null;
  const jwtPayload = decodeJwtPayload(accessToken) || {};
  return {
    version: Number(raw.version) || SESSION_VERSION,
    accessToken,
    refreshToken: typeof raw.refreshToken === 'string' ? raw.refreshToken.trim() : '',
    email: typeof raw.email === 'string' && raw.email.trim()
      ? raw.email.trim()
      : (typeof jwtPayload.email === 'string' ? jwtPayload.email : ''),
    userId: typeof raw.userId === 'string' && raw.userId.trim()
      ? raw.userId.trim()
      : (typeof jwtPayload.sub === 'string' ? jwtPayload.sub : ''),
    signedInAt: typeof raw.signedInAt === 'string' && raw.signedInAt.trim()
      ? raw.signedInAt.trim()
      : new Date().toISOString(),
  };
}

function validateSession(raw) {
  return normalizeSession(raw);
}

function toSafeSessionView(rawSession) {
  const session = normalizeSession(rawSession);
  if (!session) return null;
  return {
    version: session.version,
    email: session.email || '',
    userId: session.userId || '',
    signedInAt: session.signedInAt,
    isExpired: isTokenExpired(session.accessToken),
  };
}

function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') return null;
  if (typeof profile.id !== 'string' || !profile.id.trim()) return null;
  return {
    id: profile.id,
    username: typeof profile.username === 'string' ? profile.username : '',
    avatar_url: typeof profile.avatar_url === 'string' ? profile.avatar_url : '',
    display_name: typeof profile.display_name === 'string' ? profile.display_name : '',
    created_at: typeof profile.created_at === 'string' ? profile.created_at : null,
  };
}

function validateUserSettings(settings) {
  if (!settings || typeof settings !== 'object') return null;
  if (typeof settings.user_id !== 'string' || !settings.user_id.trim()) return null;
  return {
    user_id: settings.user_id,
    theme: typeof settings.theme === 'string' ? settings.theme : 'system',
    voice_enabled: Boolean(settings.voice_enabled),
    persona: typeof settings.persona === 'string' ? settings.persona : 'default',
    preferences: settings.preferences && typeof settings.preferences === 'object' && !Array.isArray(settings.preferences)
      ? settings.preferences
      : {},
    updated_at: typeof settings.updated_at === 'string' ? settings.updated_at : null,
  };
}

function generateOAuthState() {
  return crypto.randomBytes(24).toString('hex');
}

function matchesExpectedState(expected, received) {
  if (!expected || !received) return false;
  const left = Buffer.from(String(expected));
  const right = Buffer.from(String(received));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function parseAuthCallback(url, { expectedState = null } = {}) {
  try {
    const parsed = new URL(url);
    const hashParams = new URLSearchParams(parsed.hash.slice(1));
    const allParams = new URLSearchParams(parsed.search);
    for (const [key, value] of hashParams.entries()) {
      if (!allParams.has(key)) allParams.set(key, value);
    }

    const accessToken = allParams.get('access_token') || '';
    if (!accessToken) return null;

    const isAssistantxCallback = parsed.protocol === 'assistantx:'
      && parsed.hostname === 'auth'
      && parsed.pathname === '/callback';
    const isWebCallback = ['/auth/callback', '/jarvis/callback', '/auth/confirm', '/'].includes(parsed.pathname);
    if (!isAssistantxCallback && !isWebCallback) return null;

    const receivedState = allParams.get('state') || '';
    if (expectedState && !matchesExpectedState(expectedState, receivedState)) {
      return { error: 'state-mismatch' };
    }

    const jwtPayload = decodeJwtPayload(accessToken) || {};
    return {
      session: normalizeSession({
        version: SESSION_VERSION,
        accessToken,
        refreshToken: allParams.get('refresh_token') || '',
        email: allParams.get('email') || jwtPayload.email || '',
        userId: allParams.get('user_id') || allParams.get('sub') || jwtPayload.sub || '',
        signedInAt: new Date().toISOString(),
      }),
      state: receivedState || null,
    };
  } catch {
    return null;
  }
}

function isNetworkAuthError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();
  return /fetch failed|network|timeout|timed out|econnrefused|enotfound|ehostunreach|eai_again|etimedout|econreset|econnreset/.test(`${message} ${code}`);
}

function classifyAuthFailure({ status = null, error = null } = {}) {
  if (isNetworkAuthError(error)) return AUTH_FAILURE.OFFLINE;
  if (status === 400) return AUTH_FAILURE.INVALID_REFRESH;
  if (status === 401 || status === 403) return AUTH_FAILURE.REVOKED;
  if (status && status >= 500) return AUTH_FAILURE.SUPABASE_OUTAGE;
  return AUTH_FAILURE.UNKNOWN;
}

module.exports = {
  AUTH_FAILURE,
  REFRESH_BUFFER_SECONDS,
  SESSION_VERSION,
  classifyAuthFailure,
  decodeJwtPayload,
  generateOAuthState,
  isNetworkAuthError,
  isTokenExpired,
  matchesExpectedState,
  normalizeSession,
  parseAuthCallback,
  toSafeSessionView,
  validateProfile,
  validateSession,
  validateUserSettings,
};
