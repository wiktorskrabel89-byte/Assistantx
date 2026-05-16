'use strict';

function createVoiceInterruptionEngine({ bus, streamManager } = {}) {
  const activeVoices = new Map();

  function register(sessionId, ownership = {}) {
    const entry = {
      sessionId,
      ownerId: ownership.ownerId || `voice-${Date.now()}`,
      backend: ownership.backend || 'browser-fallback',
      wakeSuppressed: false,
      active: true,
      startedAt: new Date().toISOString(),
    };
    activeVoices.set(sessionId, entry);
    bus?.publish('voice.session.registered', entry);
    return entry;
  }

  function suppressWake(sessionId, value = true) {
    const current = activeVoices.get(sessionId);
    if (!current) return null;
    const next = { ...current, wakeSuppressed: Boolean(value) };
    activeVoices.set(sessionId, next);
    bus?.publish('voice.wake-suppressed', { sessionId, wakeSuppressed: next.wakeSuppressed });
    return next;
  }

  function interrupt(sessionId, reason = 'user-interrupt') {
    const current = activeVoices.get(sessionId);
    if (!current) return false;
    activeVoices.set(sessionId, { ...current, active: false, interruptedAt: new Date().toISOString() });
    streamManager?.interrupt(sessionId, reason);
    bus?.publish('voice.interrupted', { sessionId, ownerId: current.ownerId, reason });
    return true;
  }

  function release(sessionId) {
    const current = activeVoices.get(sessionId);
    if (!current) return false;
    activeVoices.delete(sessionId);
    bus?.publish('voice.session.released', { sessionId, ownerId: current.ownerId });
    return true;
  }

  return {
    register,
    suppressWake,
    interrupt,
    release,
  };
}

module.exports = { createVoiceInterruptionEngine };
