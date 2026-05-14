// jarvis/desktop/launcher-preload.js
// Preload script for the launcher overlay window.
// Exposes only the IPC channels the launcher overlay uses.

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_INVOKE = new Set([
  'launcher-search',
  'launcher-recent',
  'launcher-refresh',
  'launcher-launch',
  'launcher-hide',
  'launcher-confirmation-response',
  'install-everything-search',
]);

const ALLOWED_RECEIVE = new Set([
  'launcher-overlay-focus',
  'launcher-confirmation-request',
  'launcher-confirmation-cleared',
  'sidecar-status',
]);

contextBridge.exposeInMainWorld('launcherIpc', {
  invoke(channel, ...args) {
    if (!ALLOWED_INVOKE.has(channel)) {
      throw new Error(`[launcher-preload] Blocked IPC invoke: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Subscribe to push events from the main process.
   * Returns an unsubscribe function.
   * NOTE: callbacks receive payload directly — no _event argument.
   */
  on(channel, listener) {
    if (!ALLOWED_RECEIVE.has(channel)) {
      throw new Error(`[launcher-preload] Blocked IPC receive: ${channel}`);
    }
    const wrapper = (_event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapper);
    return () => ipcRenderer.removeListener(channel, wrapper);
  },
});
