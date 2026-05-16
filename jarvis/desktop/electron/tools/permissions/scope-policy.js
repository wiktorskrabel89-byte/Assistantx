'use strict';

const path = require('path');

const SENSITIVE_SEGMENTS = [
  '/.ssh/',
  '/.aws/',
  '/.gnupg/',
  '/Library/Keychains/',
  '/Windows/System32/',
  '/etc/',
  '/proc/',
  '/sys/',
];

function normalizeSlashes(value) {
  return String(value || '').replace(/\\/g, '/');
}

function enforceFilesystemScope(params = {}, sandbox) {
  const keys = ['path', 'targetPath', 'filePath'];
  for (const key of keys) {
    if (!params[key]) continue;
    const normalized = normalizeSlashes(params[key]);
    if (SENSITIVE_SEGMENTS.some((segment) => normalized.includes(segment))) {
      return { ok: false, reason: `sensitive-scope:${key}` };
    }
    if (sandbox && typeof sandbox.ensurePathWithinSandbox === 'function') {
      try {
        params[key] = sandbox.ensurePathWithinSandbox(params[key]);
      } catch {
        return { ok: false, reason: `sandbox-violation:${key}` };
      }
    } else if (path.isAbsolute(params[key])) {
      return { ok: false, reason: `absolute-path-without-sandbox:${key}` };
    }
  }
  return { ok: true, params };
}

module.exports = {
  enforceFilesystemScope,
};
