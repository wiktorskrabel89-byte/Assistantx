'use strict';

function createRuntimeCache({ now = () => Date.now() } = {}) {
  const store = new Map();

  function set(key, value, ttlMs = 60_000) {
    if (!key) return;
    store.set(key, {
      value,
      expiresAt: now() + Math.max(1_000, Number(ttlMs || 60_000)),
    });
  }

  function get(key) {
    const item = store.get(key);
    if (!item) return null;
    if (item.expiresAt <= now()) {
      store.delete(key);
      return null;
    }
    return item.value;
  }

  function invalidate(key) {
    store.delete(key);
  }

  function clear() {
    store.clear();
  }

  return {
    set,
    get,
    invalidate,
    clear,
  };
}

module.exports = { createRuntimeCache };
