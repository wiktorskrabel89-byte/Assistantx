'use strict';

const STAGES = new Set(['queued', 'planning', 'executing', 'verifying', 'retrying', 'completed', 'failed', 'cancelled']);

function createTaskManager({ bus, cancellation } = {}) {
  const tasks = new Map();

  function createTask(input = {}) {
    const id = input.id || `rt-task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const task = {
      id,
      parentId: input.parentId || null,
      owner: input.owner || 'local',
      sessionId: input.sessionId || null,
      workflowId: input.workflowId || null,
      dependencies: Array.isArray(input.dependencies) ? [...input.dependencies] : [],
      stage: STAGES.has(input.stage) ? input.stage : 'queued',
      retryCount: Number(input.retryCount || 0),
      maxRetries: Number(input.maxRetries || 2),
      status: input.status || 'queued',
      metadata: { ...(input.metadata || {}) },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      completedAt: null,
    };
    tasks.set(id, task);
    if (task.parentId && cancellation) cancellation.register(task.parentId, id);
    bus?.publish('runtime.task.created', { task });
    return task;
  }

  function updateTask(id, patch = {}) {
    const current = tasks.get(id);
    if (!current) return null;
    const nextStage = patch.stage && STAGES.has(patch.stage) ? patch.stage : current.stage;
    const next = {
      ...current,
      ...patch,
      stage: nextStage,
      metadata: {
        ...(current.metadata || {}),
        ...(patch.metadata || {}),
      },
      updatedAt: new Date().toISOString(),
    };
    if (['completed', 'failed', 'cancelled'].includes(next.stage) && !next.completedAt) {
      next.completedAt = new Date().toISOString();
    }
    tasks.set(id, next);
    bus?.publish('runtime.task.updated', { task: next });
    return next;
  }

  function incrementRetry(id, reason = 'unknown') {
    const current = tasks.get(id);
    if (!current) return null;
    return updateTask(id, {
      retryCount: current.retryCount + 1,
      stage: 'retrying',
      metadata: { lastRetryReason: reason },
    });
  }

  function canRetry(id) {
    const task = tasks.get(id);
    if (!task) return false;
    return task.retryCount < task.maxRetries;
  }

  function getTask(id) {
    return tasks.get(id) || null;
  }

  function listTasks(filters = {}) {
    return [...tasks.values()].filter((task) => {
      if (filters.sessionId && task.sessionId !== filters.sessionId) return false;
      if (filters.owner && task.owner !== filters.owner) return false;
      if (filters.stage && task.stage !== filters.stage) return false;
      return true;
    });
  }

  return {
    createTask,
    updateTask,
    incrementRetry,
    canRetry,
    getTask,
    listTasks,
  };
}

module.exports = { createTaskManager };
