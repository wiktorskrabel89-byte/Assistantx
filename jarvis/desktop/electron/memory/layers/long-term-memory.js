'use strict';

function createLongTermMemoryStore() {
  const preferences = new Map();
  return {
    set(key, value) { preferences.set(key, value); },
    get(key) { return preferences.get(key); },
    entries() { return [...preferences.entries()]; },
  };
}

module.exports = { createLongTermMemoryStore };
