'use strict';

function createRepoMemoryStore() {
  const chunks = [];
  return {
    index(chunk) { chunks.push(chunk); },
    search() { return chunks.slice(0, 20); },
  };
}

module.exports = { createRepoMemoryStore };
