'use strict';

function createStructuredLogger({ bus, sink } = {}) {
  function emit(level, event, payload = {}) {
    const entry = {
      level,
      event,
      payload,
      at: new Date().toISOString(),
      correlationId: payload.correlationId || null,
      sessionId: payload.sessionId || null,
      taskId: payload.taskId || null,
    };
    if (typeof sink === 'function') sink(entry);
    bus?.publish('runtime.log', entry);
    return entry;
  }

  return {
    debug(event, payload) { return emit('debug', event, payload); },
    info(event, payload) { return emit('info', event, payload); },
    warn(event, payload) { return emit('warn', event, payload); },
    error(event, payload) { return emit('error', event, payload); },
  };
}

module.exports = { createStructuredLogger };
