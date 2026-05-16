'use strict';

function createStreamingSessionStore() {
  const sessions = new Map();

  function create(input = {}) {
    const id = input.id || `stream-session-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = {
      id,
      ownerId: input.ownerId || null,
      state: 'created',
      sequence: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lastError: null,
    };
    sessions.set(id, session);
    return session;
  }

  function update(id, patch = {}) {
    const current = sessions.get(id);
    if (!current) return null;
    const next = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    sessions.set(id, next);
    return next;
  }

  function get(id) {
    return sessions.get(id) || null;
  }

  function remove(id) {
    sessions.delete(id);
  }

  return { create, update, get, remove };
}

module.exports = { createStreamingSessionStore };
