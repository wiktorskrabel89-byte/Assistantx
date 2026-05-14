// jarvis/desktop/preload.js
// Runs in a privileged context with access to Node/Electron APIs but is NOT
// the renderer. Exposes a locked-down IPC surface to the renderer via
// contextBridge so that nodeIntegration: false / contextIsolation: true can be
// used on the main window — eliminating full Node access from any XSS vector.

const { contextBridge, ipcRenderer } = require('electron');

// ── Allowed invoke channels (renderer → main, one-shot) ──────────────────────
const ALLOWED_INVOKE = new Set([
  'get-app-meta',
  'get-sidecar-status',
  'restart-sidecar',
  'check-for-updates',
  'download-update',
  'install-update',
  'get-jarvis-web-url',
  'set-jarvis-web-url',
  'open-account-login',
  'open-url',
  'open-path',
  'jarvis-ai-request',
  'get-displays',
]);

// ── Allowed receive channels (main → renderer, push events) ──────────────────
const ALLOWED_RECEIVE = new Set([
  'app-meta',
  'auto-update-status',
  'sidecar-status',
]);

contextBridge.exposeInMainWorld('jarvisIpc', {
  /**
   * Invoke an IPC handler in the main process.
   * Only channels listed in ALLOWED_INVOKE are permitted.
   */
  invoke(channel, ...args) {
    if (!ALLOWED_INVOKE.has(channel)) {
      throw new Error(`[preload] Blocked IPC invoke: ${channel}`);
    }
    return ipcRenderer.invoke(channel, ...args);
  },

  /**
   * Subscribe to push events from the main process.
   * Only channels listed in ALLOWED_RECEIVE are permitted.
   * Returns an unsubscribe function.
   */
  on(channel, listener) {
    if (!ALLOWED_RECEIVE.has(channel)) {
      throw new Error(`[preload] Blocked IPC receive: ${channel}`);
    }
    const wrapper = (_event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapper);
    return () => ipcRenderer.removeListener(channel, wrapper);
  },
});
