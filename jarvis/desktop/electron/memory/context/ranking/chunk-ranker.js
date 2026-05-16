'use strict';

function scoreChunk(chunk = {}, context = {}) {
  let score = 0;
  const query = String(context.query || '').toLowerCase();
  const text = String(chunk.text || '').toLowerCase();

  if (query && text.includes(query)) score += 3;
  if (chunk.semanticScore) score += Number(chunk.semanticScore || 0);
  if (chunk.recencyScore) score += Number(chunk.recencyScore || 0);
  if (chunk.dependencyScore) score += Number(chunk.dependencyScore || 0);
  if (chunk.pathScore) score += Number(chunk.pathScore || 0);

  return score;
}

function rankChunks(chunks = [], context = {}) {
  return chunks
    .map((chunk) => ({ ...chunk, rankScore: scoreChunk(chunk, context) }))
    .sort((a, b) => b.rankScore - a.rankScore);
}

module.exports = {
  rankChunks,
};
