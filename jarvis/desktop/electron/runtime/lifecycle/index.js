'use strict';

function createLifecycleCoordinator({ bus, sessions, taskManager, concurrency, metrics, timeline } = {}) {
  function mark(event, payload = {}) {
    bus?.publish(`runtime.lifecycle.${event}`, payload);
    timeline?.add({ type: `lifecycle:${event}`, ...payload });
  }

  function beginSession(input = {}) {
    const session = sessions.createSession(input);
    metrics?.increment('runtime.sessions.created', 1, { owner: session.owner });
    mark('session-begin', { sessionId: session.id, correlationId: session.correlationId, owner: session.owner });
    return session;
  }

  function beginTask(input = {}) {
    const task = taskManager.createTask(input);
    const acquired = concurrency.tryAcquire({
      id: task.id,
      owner: task.owner,
      provider: task.metadata.provider || 'unknown',
    });
    if (!acquired.ok) {
      taskManager.updateTask(task.id, {
        stage: 'failed',
        status: 'failed',
        metadata: { ...(task.metadata || {}), concurrencyError: acquired.reason },
      });
      mark('task-failed', { taskId: task.id, reason: acquired.reason, sessionId: task.sessionId });
      return { task: taskManager.getTask(task.id), acquired };
    }
    taskManager.updateTask(task.id, { stage: 'planning', status: 'running' });
    metrics?.increment('runtime.tasks.started', 1, { owner: task.owner });
    mark('task-begin', { taskId: task.id, sessionId: task.sessionId, owner: task.owner });
    return { task: taskManager.getTask(task.id), acquired };
  }

  function completeTask(task, status = 'completed', details = {}) {
    if (!task?.id) return null;
    const stage = status === 'completed' ? 'completed' : status === 'cancelled' ? 'cancelled' : 'failed';
    const next = taskManager.updateTask(task.id, {
      stage,
      status,
      metadata: {
        ...(task.metadata || {}),
        ...(details || {}),
      },
    });
    concurrency.release({
      id: task.id,
      owner: task.owner,
      provider: task.metadata?.provider || 'unknown',
    });
    metrics?.increment(`runtime.tasks.${status}`, 1, { owner: task.owner || 'unknown' });
    mark('task-end', { taskId: task.id, sessionId: task.sessionId, status });
    return next;
  }

  function endSession(sessionId) {
    const ok = sessions.endSession(sessionId);
    if (ok) {
      metrics?.increment('runtime.sessions.ended', 1);
      mark('session-end', { sessionId });
    }
    return ok;
  }

  return {
    beginSession,
    beginTask,
    completeTask,
    endSession,
  };
}

module.exports = { createLifecycleCoordinator };
