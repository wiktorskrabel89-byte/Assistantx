'use strict';

const { EventEmitter } = require('events');

function createInternalEventBus() {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);

  return {
    publish(event, payload = {}) {
      emitter.emit(event, { event, payload, at: new Date().toISOString() });
    },
    subscribe(event, handler) {
      emitter.on(event, handler);
      return () => emitter.removeListener(event, handler);
    },
  };
}

module.exports = {
  createInternalEventBus,
};
