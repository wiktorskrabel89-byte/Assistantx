'use strict';

const { EventEmitter } = require('events');

const authEvents = new EventEmitter();
const EVENT_SESSION_CHANGED = 'session-changed';
const EVENT_SIGNED_OUT = 'signed-out';

function emitSessionChanged(session, meta = {}) {
  authEvents.emit(EVENT_SESSION_CHANGED, { session, meta });
}

function emitSignedOut(meta = {}) {
  authEvents.emit(EVENT_SIGNED_OUT, { meta });
}

function onSessionChanged(listener) {
  authEvents.on(EVENT_SESSION_CHANGED, listener);
  return () => authEvents.off(EVENT_SESSION_CHANGED, listener);
}

function onSignedOut(listener) {
  authEvents.on(EVENT_SIGNED_OUT, listener);
  return () => authEvents.off(EVENT_SIGNED_OUT, listener);
}

module.exports = {
  emitSessionChanged,
  emitSignedOut,
  onSessionChanged,
  onSignedOut,
};
