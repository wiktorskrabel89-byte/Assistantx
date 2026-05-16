'use strict';

function createCancellationController({ bus } = {}) {
  const cancellationGraph = new Map();
  const cancelled = new Set();

  function register(parentId, childId) {
    if (!parentId || !childId) return;
    if (!cancellationGraph.has(parentId)) cancellationGraph.set(parentId, new Set());
    cancellationGraph.get(parentId).add(childId);
  }

  function _collectCascade(rootId, bag) {
    if (!rootId || bag.has(rootId)) return;
    bag.add(rootId);
    const children = cancellationGraph.get(rootId) || new Set();
    for (const child of children) _collectCascade(child, bag);
  }

  function cancel(rootId, reason = 'cancelled') {
    const affected = new Set();
    _collectCascade(rootId, affected);
    if (affected.size === 0 && rootId) affected.add(rootId);
    for (const id of affected) cancelled.add(id);
    const payload = {
      rootId,
      reason,
      affected: [...affected],
      at: new Date().toISOString(),
    };
    bus?.publish('runtime.cancelled', payload);
    return payload;
  }

  function isCancelled(id) {
    return cancelled.has(id);
  }

  function clear(id) {
    cancelled.delete(id);
    cancellationGraph.delete(id);
    for (const children of cancellationGraph.values()) children.delete(id);
  }

  return {
    register,
    cancel,
    clear,
    isCancelled,
  };
}

module.exports = { createCancellationController };
