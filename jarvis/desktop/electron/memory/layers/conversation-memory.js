'use strict';

function createConversationMemory(maxEntries = 20) {
  const entries = [];
  return {
    add(role, content) {
      entries.push({ role, content, at: new Date().toISOString() });
      if (entries.length > maxEntries) entries.shift();
    },
    list() {
      return [...entries];
    },
  };
}

module.exports = { createConversationMemory };
