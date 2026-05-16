'use strict';

function createEventSync() {
  const seenByStream = new Map();

  function accept(event = {}) {
    const streamId = event.streamId || 'default';
    const sequence = Number(event.sequence || 0);
    const last = Number(seenByStream.get(streamId) || 0);
    if (sequence <= last) return false;
    seenByStream.set(streamId, sequence);
    return true;
  }

  return {
    accept,
  };
}

module.exports = { createEventSync };
