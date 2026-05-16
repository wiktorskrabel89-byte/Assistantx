'use strict';

function createStreamingInterruptionController({ onInterrupt } = {}) {
  return {
    interrupt(session, reason = 'user-interrupt') {
      if (!session) return { ok: false, reason: 'missing-session' };
      if (typeof onInterrupt === 'function') onInterrupt(session, reason);
      return { ok: true, sessionId: session.id, reason };
    },
  };
}

module.exports = { createStreamingInterruptionController };
