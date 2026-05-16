'use strict';

function estimateTokens(value) {
  if (value === null || value === undefined) return 0;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return Math.ceil(String(text || '').length / 4);
}

function estimateChunkTokens(chunks = []) {
  return chunks.map((chunk) => ({
    ...chunk,
    estimatedTokens: estimateTokens(chunk.text || chunk.summary || ''),
  }));
}

module.exports = {
  estimateTokens,
  estimateChunkTokens,
};
