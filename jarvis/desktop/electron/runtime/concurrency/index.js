'use strict';

function createConcurrencyController({
  maxGlobal = 8,
  maxPerOwner = 3,
  maxPerProvider = 4,
  bus,
} = {}) {
  const globalActive = new Set();
  const byOwner = new Map();
  const byProvider = new Map();

  function count(map, key) {
    return (map.get(key) || new Set()).size;
  }

  function add(map, key, id) {
    if (!map.has(key)) map.set(key, new Set());
    map.get(key).add(id);
  }

  function remove(map, key, id) {
    const set = map.get(key);
    if (!set) return;
    set.delete(id);
    if (set.size === 0) map.delete(key);
  }

  function tryAcquire({ id, owner = 'local', provider = 'unknown' } = {}) {
    if (!id) return { ok: false, reason: 'missing-id' };
    if (globalActive.size >= maxGlobal) return { ok: false, reason: 'global-limit' };
    if (count(byOwner, owner) >= maxPerOwner) return { ok: false, reason: 'owner-limit' };
    if (count(byProvider, provider) >= maxPerProvider) return { ok: false, reason: 'provider-limit' };

    globalActive.add(id);
    add(byOwner, owner, id);
    add(byProvider, provider, id);
    bus?.publish('runtime.concurrency.acquired', { id, owner, provider });
    return { ok: true };
  }

  function release({ id, owner = 'local', provider = 'unknown' } = {}) {
    if (!id) return;
    globalActive.delete(id);
    remove(byOwner, owner, id);
    remove(byProvider, provider, id);
    bus?.publish('runtime.concurrency.released', { id, owner, provider });
  }

  function snapshot() {
    return {
      globalActive: globalActive.size,
      byOwner: [...byOwner.entries()].map(([owner, set]) => ({ owner, active: set.size })),
      byProvider: [...byProvider.entries()].map(([provider, set]) => ({ provider, active: set.size })),
      limits: { maxGlobal, maxPerOwner, maxPerProvider },
    };
  }

  return {
    tryAcquire,
    release,
    snapshot,
  };
}

module.exports = { createConcurrencyController };
