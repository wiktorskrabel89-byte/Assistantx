'use strict';

const { getTelemetrySnapshot, updateTelemetry } = require('../local-state');

function wireLocalTelemetry(eventBus) {
  if (!eventBus?.subscribe) return () => {};

  const unsubscribe = eventBus.subscribe((eventName) => {
    const now = new Date().toISOString();

    updateTelemetry((current) => {
      const sidecar = { ...(current.sidecar || {}) };
      const startup = { ...(current.startup || {}) };

      if (eventName === 'sidecar.started') sidecar.started = Number(sidecar.started || 0) + 1;
      if (eventName === 'sidecar.running') sidecar.running = Number(sidecar.running || 0) + 1;
      if (eventName === 'sidecar.exit') sidecar.exits = Number(sidecar.exits || 0) + 1;
      if (eventName === 'sidecar.error') sidecar.errors = Number(sidecar.errors || 0) + 1;
      if (eventName === 'sidecar.reconnect') sidecar.reconnects = Number(sidecar.reconnects || 0) + 1;
      if (eventName === 'sidecar.unavailable') sidecar.unavailable = Number(sidecar.unavailable || 0) + 1;
      if (eventName === 'sidecar.restart') sidecar.restarts = Number(sidecar.restarts || 0) + 1;

      if (eventName === 'startup.healthy') startup.healthy = Number(startup.healthy || 0) + 1;
      if (eventName === 'startup.degraded') startup.degraded = Number(startup.degraded || 0) + 1;
      if (eventName === 'startup.unavailable') startup.unavailable = Number(startup.unavailable || 0) + 1;

      if (eventName.startsWith('sidecar.')) sidecar.lastEventAt = now;
      if (eventName.startsWith('startup.')) startup.lastEventAt = now;

      return {
        ...current,
        sidecar,
        startup,
      };
    });
  });

  return unsubscribe;
}

function getLocalTelemetrySnapshot() {
  return getTelemetrySnapshot();
}

module.exports = {
  getLocalTelemetrySnapshot,
  wireLocalTelemetry,
};
