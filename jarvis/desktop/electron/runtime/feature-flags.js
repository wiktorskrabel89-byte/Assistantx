'use strict';

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}

function isEnabled(value, fallback = false) {
  const normalized = normalize(value);
  if (!normalized) return Boolean(fallback);
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(normalized);
}

function isRuntimeV2Enabled() {
  return isEnabled(process.env.JARVIS_RUNTIME_V2 || process.env.runtime_v2, false);
}

module.exports = {
  isEnabled,
  isRuntimeV2Enabled,
};
