'use strict';

function createRoutingTelemetryLogger({ bus } = {}) {
  return {
    logDecision(decision, analysis) {
      if (!bus) return;
      bus.publish('router.decision', { decision, analysis });
    },
    logFallback(from, to, reason) {
      if (!bus) return;
      bus.publish('router.fallback', { from, to, reason });
    },
  };
}

module.exports = { createRoutingTelemetryLogger };
