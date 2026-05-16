'use strict';

const { redactAuthValue } = require('../electron/auth/redaction');

function logInvalidIpc(channel, reason, details = {}) {
  console.warn('[ipc][invalid]', JSON.stringify(redactAuthValue({ channel, reason, ...details })));
}

function invalidResult(channel, reason, details = {}) {
  logInvalidIpc(channel, reason, details);
  return {
    ok: false,
    error: 'invalid-input',
    reason,
  };
}

function parseHttpUrl(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function validateString(value, { maxLen = 4096, allowEmpty = false } = {}) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!allowEmpty && !trimmed) return null;
  if (trimmed.length > maxLen) return null;
  return trimmed;
}

function validateInteger(value, { min = Number.MIN_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER, fallback = null } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const integer = Math.trunc(num);
  if (integer < min || integer > max) return fallback;
  return integer;
}

function validatePlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

module.exports = {
  invalidResult,
  parseHttpUrl,
  validateInteger,
  validatePlainObject,
  validateString,
};
