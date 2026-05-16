'use strict';

const DANGEROUS_COMMAND_PATTERNS = [
  /\brm\s+-rf\b/i,
  /\bshutdown\b/i,
  /\bformat\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bpoweroff\b/i,
  /\breboot\b/i,
];

function containsDangerousCommand(value) {
  const text = String(value || '');
  return DANGEROUS_COMMAND_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeParams(params = {}) {
  const next = {};
  for (const [key, value] of Object.entries(params || {})) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (containsDangerousCommand(trimmed)) {
        return { ok: false, reason: `dangerous-command:${key}` };
      }
      next[key] = trimmed;
      continue;
    }
    next[key] = value;
  }
  return { ok: true, params: next };
}

module.exports = {
  containsDangerousCommand,
  sanitizeParams,
};
