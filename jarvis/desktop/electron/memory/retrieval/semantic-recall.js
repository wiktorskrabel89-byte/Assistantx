'use strict';

async function semanticRecall({ query, sources = [] }) {
  const normalized = String(query || '').toLowerCase();
  return sources.filter((item) => String(item.text || '').toLowerCase().includes(normalized)).slice(0, 10);
}

module.exports = { semanticRecall };
