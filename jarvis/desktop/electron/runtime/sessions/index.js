'use strict';

function createRuntimeSessions({ bus } = {}) {
  const sessions = new Map();

  function createSession(input = {}) {
    const id = input.id || `session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      id,
      owner: input.owner || 'local',
      correlationId: input.correlationId || `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      modelRoute: input.modelRoute || null,
      memoryContext: input.memoryContext || null,
      permissionScope: input.permissionScope || 'default',
      workflowState: input.workflowState || 'created',
      interruption: {
        active: false,
        reason: null,
        at: null,
      },
      activeWorkflowId: input.activeWorkflowId || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: { ...(input.metadata || {}) },
    };
    sessions.set(id, session);
    bus?.publish('runtime.session.created', { session });
    return session;
  }

  function updateSession(id, patch = {}) {
    const current = sessions.get(id);
    if (!current) return null;
    const next = {
      ...current,
      ...patch,
      metadata: {
        ...(current.metadata || {}),
        ...(patch.metadata || {}),
      },
      updatedAt: new Date().toISOString(),
    };
    sessions.set(id, next);
    bus?.publish('runtime.session.updated', { session: next });
    return next;
  }

  function markInterrupted(id, reason = 'user-interrupt') {
    return updateSession(id, {
      interruption: {
        active: true,
        reason,
        at: new Date().toISOString(),
      },
      workflowState: 'interrupted',
    });
  }

  function getSession(id) {
    return sessions.get(id) || null;
  }

  function endSession(id) {
    const current = sessions.get(id);
    if (!current) return false;
    sessions.delete(id);
    bus?.publish('runtime.session.ended', { session: current });
    return true;
  }

  function listSessions() {
    return [...sessions.values()];
  }

  return {
    createSession,
    updateSession,
    markInterrupted,
    getSession,
    endSession,
    listSessions,
  };
}

module.exports = { createRuntimeSessions };
