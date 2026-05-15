'use strict';

function createEventBus() {
  const listeners = new Set();

  function publish(eventName, payload = {}) {
    for (const listener of listeners) {
      try {
        listener(eventName, payload);
      } catch (error) {
        console.warn('[telemetry][listener-error]', error?.message || error);
      }
    }
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return { publish, subscribe };
}

module.exports = { createEventBus };
