'use strict';

function compressChunks(chunks = [], { maxChars = 1200 } = {}) {
  const seen = new Set();
  const compressed = [];

  for (const chunk of chunks) {
    const text = String(chunk.text || '').replace(/\s+/g, ' ').trim();
    if (!text) continue;
    const key = text.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    compressed.push({
      ...chunk,
      text: text.length > maxChars ? `${text.slice(0, maxChars)}…` : text,
    });
  }

  return compressed;
}

module.exports = {
  compressChunks,
};
