'use strict';

const SENSITIVE_KEYS = new Set([
  'access_token',
  'accessToken',
  'refresh_token',
  'refreshToken',
  'token',
  'authorization',
  'apikey',
  'apiKey',
  'state',
]);

function redactToken(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  return '[REDACTED]';
}

function redactHeaders(headers = {}) {
  if (!headers || typeof headers !== 'object') return headers;
  const next = Array.isArray(headers) ? [] : {};
  for (const [key, value] of Object.entries(headers)) {
    next[key] = SENSITIVE_KEYS.has(String(key)) || /authorization|token|apikey/i.test(String(key))
      ? redactToken(String(value))
      : value;
  }
  return next;
}

function redactUrl(url) {
  if (typeof url !== 'string' || !url) return url;
  try {
    const parsed = new URL(url);
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (SENSITIVE_KEYS.has(key) || /token|state/i.test(key)) {
        parsed.searchParams.set(key, '[REDACTED]');
      }
    }
    if (parsed.hash) {
      const hashParams = new URLSearchParams(parsed.hash.slice(1));
      let changed = false;
      for (const key of Array.from(hashParams.keys())) {
        if (SENSITIVE_KEYS.has(key) || /token|state/i.test(key)) {
          hashParams.set(key, '[REDACTED]');
          changed = true;
        }
      }
      if (changed) parsed.hash = `#${hashParams.toString()}`;
    }
    return parsed.toString();
  } catch {
    return url
      .replace(/([?&#](?:access_token|refresh_token|token|state|code)=)[^&#]*/gi, '$1[REDACTED]')
      .replace(/(authorization["']?\s*[:=]\s*["']?)([^"',\s]+)/gi, '$1[REDACTED]');
  }
}

function redactAuthValue(value, depth = 0) {
  if (depth > 4) return value;
  if (typeof value === 'string') {
    return redactUrl(value);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactAuthValue(item, depth + 1));
  }
  if (!value || typeof value !== 'object') return value;

  const next = {};
  for (const [key, nested] of Object.entries(value)) {
    if (SENSITIVE_KEYS.has(key) || /token|authorization|apikey|state/i.test(key)) {
      next[key] = typeof nested === 'string' ? redactToken(nested) : '[REDACTED]';
      continue;
    }
    if (/headers/i.test(key) && nested && typeof nested === 'object') {
      next[key] = redactHeaders(nested);
      continue;
    }
    next[key] = redactAuthValue(nested, depth + 1);
  }
  return next;
}

module.exports = {
  redactAuthValue,
  redactHeaders,
  redactToken,
  redactUrl,
};
