'use strict';

function createRuntimeStreamManager({ bus, cancellation, timeline } = {}) {
  const streams = new Map();

  function open({ sessionId, ownerId, channel = 'ai' } = {}) {
    if (!sessionId || !ownerId) return { ok: false, reason: 'missing-session-or-owner' };
    const id = `${sessionId}:${channel}`;
    const existing = streams.get(id);
    if (existing && existing.active && existing.ownerId !== ownerId) {
      return { ok: false, reason: 'ownership-conflict', stream: existing };
    }
    const stream = {
      id,
      sessionId,
      channel,
      ownerId,
      active: true,
      sequence: existing?.sequence || 0,
      buffered: [],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    streams.set(id, stream);
    bus?.publish('runtime.stream.opened', { stream });
    timeline?.add({ type: 'stream.opened', sessionId, channel, ownerId });
    return { ok: true, stream };
  }

  function emit({ sessionId, channel = 'ai', ownerId, eventType, payload = {} } = {}) {
    const id = `${sessionId}:${channel}`;
    const stream = streams.get(id);
    if (!stream || !stream.active) return { ok: false, reason: 'stream-not-active' };
    if (stream.ownerId !== ownerId) return { ok: false, reason: 'stale-owner' };
    stream.sequence += 1;
    stream.updatedAt = new Date().toISOString();
    const event = {
      id: `${id}:${stream.sequence}`,
      streamId: id,
      sessionId,
      sequence: stream.sequence,
      type: eventType || 'chunk',
      payload,
      at: stream.updatedAt,
      ownerId,
    };
    stream.buffered.push(event);
    if (stream.buffered.length > 200) stream.buffered.shift();
    bus?.publish('runtime.stream.event', event);
    timeline?.add({ type: 'stream.event', sessionId, eventType: event.type, sequence: event.sequence, ownerId });
    return { ok: true, event };
  }

  function interrupt(sessionId, reason = 'interrupt') {
    for (const stream of streams.values()) {
      if (stream.sessionId !== sessionId || !stream.active) continue;
      stream.active = false;
      stream.updatedAt = new Date().toISOString();
      cancellation?.cancel(stream.ownerId, reason);
      bus?.publish('runtime.stream.interrupted', {
        streamId: stream.id,
        sessionId,
        ownerId: stream.ownerId,
        reason,
        at: stream.updatedAt,
      });
    }
  }

  function close({ sessionId, channel = 'ai', ownerId } = {}) {
    const id = `${sessionId}:${channel}`;
    const stream = streams.get(id);
    if (!stream) return false;
    if (ownerId && stream.ownerId !== ownerId) return false;
    stream.active = false;
    stream.updatedAt = new Date().toISOString();
    bus?.publish('runtime.stream.closed', { streamId: id, sessionId, ownerId: stream.ownerId, at: stream.updatedAt });
    return true;
  }

  function recover({ sessionId, channel = 'ai', lastSequence = 0 } = {}) {
    const id = `${sessionId}:${channel}`;
    const stream = streams.get(id);
    if (!stream) return [];
    return stream.buffered.filter((event) => event.sequence > Number(lastSequence || 0));
  }

  function snapshot() {
    return [...streams.values()].map((stream) => ({
      id: stream.id,
      sessionId: stream.sessionId,
      channel: stream.channel,
      ownerId: stream.ownerId,
      active: stream.active,
      sequence: stream.sequence,
    }));
  }

  return {
    open,
    emit,
    interrupt,
    close,
    recover,
    snapshot,
  };
}

module.exports = { createRuntimeStreamManager };
