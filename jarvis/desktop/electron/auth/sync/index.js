'use strict';

const { onSessionChanged, onSignedOut } = require('../events');
const { toSafeSessionView } = require('../validators');

function normalizeWindows(target) {
  if (typeof target === 'function') return normalizeWindows(target());
  if (!target) return [];
  return Array.isArray(target) ? target.filter(Boolean) : [target];
}

function send(channel, payload, target) {
  for (const win of normalizeWindows(target)) {
    if (win && !win.isDestroyed()) {
      win.webContents.send(channel, payload);
    }
  }
}

function broadcastSessionChanged(target, session, meta = {}) {
  send('auth:session-changed', {
    session: toSafeSessionView(session),
    reason: meta.reason || null,
  }, target);
}

function broadcastSignedOut(target, meta = {}) {
  send('auth:signed-out', {
    reason: meta.reason || null,
  }, target);
}

function bindAuthEvents(target) {
  const offChanged = onSessionChanged(({ session, meta }) => {
    broadcastSessionChanged(target, session, meta);
  });
  const offSignedOut = onSignedOut(({ meta }) => {
    broadcastSignedOut(target, meta);
  });
  return () => {
    offChanged();
    offSignedOut();
  };
}

module.exports = {
  bindAuthEvents,
  broadcastSessionChanged,
  broadcastSignedOut,
};
