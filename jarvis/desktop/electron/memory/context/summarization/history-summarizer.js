'use strict';

function summarizeHistory(entries = [], maxEntries = 12) {
  const normalized = entries
    .filter((entry) => entry && typeof entry === 'object')
    .slice(-maxEntries)
    .map((entry) => `${entry.role || 'unknown'}: ${String(entry.content || '').slice(0, 160)}`);

  if (normalized.length === 0) return '';
  return normalized.join('\n');
}

module.exports = {
  summarizeHistory,
};
