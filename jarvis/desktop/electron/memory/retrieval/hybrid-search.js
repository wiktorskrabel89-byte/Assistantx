'use strict';

function normalize(text) {
  return String(text || '').toLowerCase();
}

function keywordScore(query, text) {
  if (!query || !text) return 0;
  const terms = normalize(query).split(/\s+/).filter(Boolean);
  let score = 0;
  const haystack = normalize(text);
  for (const term of terms) {
    if (haystack.includes(term)) score += 1;
  }
  return score;
}

function embeddingScore(item) {
  return Number(item.embeddingScore || 0);
}

function pathScore(query, item) {
  const path = normalize(item.path || '');
  const q = normalize(query || '');
  if (!path || !q) return 0;
  return path.includes(q) ? 1 : 0;
}

function hybridSearch({ query, sources = [] }) {
  return sources
    .map((item) => {
      const score = keywordScore(query, item.text || item.summary || '')
        + embeddingScore(item)
        + pathScore(query, item);
      return { ...item, retrievalScore: score };
    })
    .filter((item) => item.retrievalScore > 0)
    .sort((a, b) => b.retrievalScore - a.retrievalScore);
}

module.exports = { hybridSearch };
