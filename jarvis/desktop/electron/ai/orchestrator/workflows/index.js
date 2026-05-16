'use strict';

function buildTaskGraph(plan = {}) {
  const steps = Array.isArray(plan.steps) ? plan.steps : [];
  const nodes = new Map();

  for (const step of steps) {
    nodes.set(step.id, {
      ...step,
      status: 'pending',
      attempts: 0,
      result: null,
      error: null,
    });
  }

  function readyNodes() {
    return [...nodes.values()].filter((node) => {
      if (node.status !== 'pending') return false;
      return (node.dependsOn || []).every((dependency) => nodes.get(dependency)?.status === 'completed');
    });
  }

  function markRunning(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return null;
    node.status = 'running';
    node.attempts += 1;
    return node;
  }

  function markCompleted(nodeId, result) {
    const node = nodes.get(nodeId);
    if (!node) return null;
    node.status = 'completed';
    node.result = result;
    return node;
  }

  function markFailed(nodeId, error) {
    const node = nodes.get(nodeId);
    if (!node) return null;
    node.status = 'failed';
    node.error = error;
    return node;
  }

  function resetForRetry(nodeId) {
    const node = nodes.get(nodeId);
    if (!node) return null;
    node.status = 'pending';
    node.error = null;
    return node;
  }

  function hasFailures() {
    return [...nodes.values()].some((node) => node.status === 'failed');
  }

  function isComplete() {
    return [...nodes.values()].every((node) => node.status === 'completed');
  }

  function snapshot() {
    return [...nodes.values()].map((node) => ({
      id: node.id,
      name: node.name,
      status: node.status,
      attempts: node.attempts,
      dependsOn: node.dependsOn,
      error: node.error,
    }));
  }

  return {
    readyNodes,
    markRunning,
    markCompleted,
    markFailed,
    resetForRetry,
    hasFailures,
    isComplete,
    snapshot,
    getNode(id) {
      return nodes.get(id) || null;
    },
  };
}

module.exports = { buildTaskGraph };
