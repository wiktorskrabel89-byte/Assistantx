'use strict';

const BLOCKED_PATCH_PATTERNS = [
  /\*\*\* Delete File: \/etc\//i,
  /\*\*\* Delete File: \/usr\//i,
  /\*\*\* Delete File: \/bin\//i,
  /\*\*\* Delete File: [A-Za-z]:\\Windows\\/i,
];

function validatePatchPayload(patch) {
  if (patch === undefined || patch === null || patch === '') return { ok: true };
  if (typeof patch !== 'string') return { ok: false, reason: 'patch-must-be-string' };
  if (patch.length > 300_000) return { ok: false, reason: 'patch-too-large' };
  if (!patch.includes('*** Begin Patch') || !patch.includes('*** End Patch')) {
    return { ok: false, reason: 'patch-markers-required' };
  }
  for (const pattern of BLOCKED_PATCH_PATTERNS) {
    if (pattern.test(patch)) return { ok: false, reason: 'patch-targets-sensitive-path' };
  }
  return { ok: true };
}

module.exports = {
  validatePatchPayload,
};
