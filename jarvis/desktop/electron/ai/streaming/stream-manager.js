'use strict';

const { createStreamingSessionStore } = require('./sessions/session-store');
const { transition } = require('./lifecycle/state-machine');
const { createStreamingInterruptionController } = require('./interruptions/controller');
const { createRecoveryBuffer } = require('./buffering/recovery-buffer');
const { createEventSync } = require('./sync/event-sync');

function createStreamManager({ bus, runtimeStreamManager } = {}) {
  const sessions = createStreamingSessionStore();
  const recoveryBuffer = createRecoveryBuffer();
  const eventSync = createEventSync();

  const interruptions = createStreamingInterruptionController({
    onInterrupt(session, reason) {
      runtimeStreamManager?.interrupt(session.id, reason);
      const moved = transition(session, 'interrupted');
      if (moved.ok) sessions.update(session.id, { state: moved.state, lastError: reason });
      bus?.publish('stream.interrupted', { sessionId: session.id, reason });
    },
  });

  function createSession({ sessionId, ownerId } = {}) {
    const session = sessions.create({ id: sessionId, ownerId });
    const moved = transition(session, 'active');
    if (moved.ok) sessions.update(session.id, { state: moved.state });
    runtimeStreamManager?.open({ sessionId: session.id, ownerId, channel: 'ai' });
    bus?.publish('stream.session.created', { sessionId: session.id, ownerId });
    return sessions.get(session.id);
  }

  function emit(sessionId, ownerId, type, payload = {}) {
    const session = sessions.get(sessionId);
    if (!session) return { ok: false, reason: 'missing-session' };
    const nextSequence = Number(session.sequence || 0) + 1;
    const event = {
      streamId: session.id,
      sessionId,
      sequence: nextSequence,
      type,
      payload,
      ownerId,
      at: new Date().toISOString(),
    };
    if (!eventSync.accept(event)) return { ok: false, reason: 'duplicate-or-stale' };
    sessions.update(sessionId, { sequence: nextSequence });
    recoveryBuffer.push(event);
    const forwarded = runtimeStreamManager?.emit({
      sessionId,
      channel: 'ai',
      ownerId,
      eventType: type,
      payload,
    });
    bus?.publish('stream.event', event);
    return forwarded || { ok: true, event };
  }

  function recover(sessionId, fromSequence = 0) {
    return recoveryBuffer.since(fromSequence).filter((event) => event.sessionId === sessionId);
  }

  function complete(sessionId, ownerId) {
    const session = sessions.get(sessionId);
    if (!session) return false;
    const moved = transition(session, 'completed');
    if (moved.ok) sessions.update(sessionId, { state: moved.state });
    runtimeStreamManager?.close({ sessionId, channel: 'ai', ownerId });
    bus?.publish('stream.completed', { sessionId, ownerId });
    return true;
  }

  function fail(sessionId, ownerId, reason = 'stream-failure') {
    const session = sessions.get(sessionId);
    if (!session) return false;
    const moved = transition(session, 'failed');
    if (moved.ok) sessions.update(sessionId, { state: moved.state, lastError: reason });
    runtimeStreamManager?.close({ sessionId, channel: 'ai', ownerId });
    bus?.publish('stream.failed', { sessionId, ownerId, reason });
    return true;
  }

  function interrupt(sessionId, reason = 'user-interrupt') {
    const session = sessions.get(sessionId);
    return interruptions.interrupt(session, reason);
  }

  return {
    createSession,
    emit,
    emitText(token, sessionId = 'default', ownerId = 'legacy-stream-owner') {
      return emit(sessionId, ownerId, 'token', { token });
    },
    emitThought(status, sessionId = 'default', ownerId = 'legacy-stream-owner') {
      return emit(sessionId, ownerId, 'thought', { status });
    },
    emitState(state, sessionId = 'default', ownerId = 'legacy-stream-owner') {
      return emit(sessionId, ownerId, 'state', { state });
    },
    recover,
    complete,
    fail,
    interrupt,
  };
}

module.exports = { createStreamManager };
