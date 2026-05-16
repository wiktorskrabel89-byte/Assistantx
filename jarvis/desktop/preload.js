// jarvis/desktop/preload.js
// Runs in a privileged Node context (renderer process, before page scripts).
// Exposes a locked-down surface to the renderer via contextBridge so the main
// window can use nodeIntegration: false / contextIsolation: true — meaning any
// XSS in the renderer cannot reach Node.js, the filesystem, or shell.
//
// Two globals are exposed:
//   window.jarvisIpc  — thin IPC bridge (invoke + on)
//   window.jarvisApi  — all Node-module APIs the renderer needs

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function buildJarvisApiV2(deps) {
  const {
    getToken,
    backend,
    localState,
    scheduler,
    accounts,
    runtime,
    sidecar,
    voiceGateway,
  } = deps;

  return {
    auth: { getToken },
    backend,
    localState,
    scheduler,
    accounts,
    runtime,
    voice: {
      sidecar,
      gateway: voiceGateway,
    },
  };
}

// ── IPC channel allow-lists ───────────────────────────────────────────────────
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
  'get-desktop-diagnostics',
  'get-local-telemetry',
]);

const ALLOWED_RECEIVE = new Set([
  'app-meta',
  'auto-update-status',
  'sidecar-status',
  'desktop-health',
]);

// ── Node module imports ───────────────────────────────────────────────────────
// All require() calls happen here in the privileged preload context.

const { getToken } = require('./auth');

const {
  connectToBackend,
  executeStructuredCommand,
  getLocalStateSnapshot,
  onMessage,
  onStatus,
  queuePromptExecution,
} = require('./backend');

const {
  addSchedule,
  getSchedules,
  syncToCloud,
  loadFromCloud,
} = require('./local-state');

const { startScheduler } = require('./scheduler');

const {
  getAccountSession,
  setAccountSession,
  clearAccountSession,
  getLinkedAccounts,
  refreshSessionIfNeeded,
} = require('./accounts');

const {
  getJarvisApiUrl,
  getJarvisWebUrl,
  setJarvisWebUrl,
} = require('./runtime-config');

const { VoiceGateway } = require('./voice-gateway');

// SidecarBridge — instantiated once in the preload so its WebSocket/Web Audio
// APIs (which are renderer-process browser globals) are available.
let sidecarBridge = null;
try {
  const { SidecarBridge } = require('./sidecar-bridge');
  sidecarBridge = new SidecarBridge();
} catch {
  // Python sidecar not packaged or sidecar-bridge unavailable — browser fallback.
}

const voiceGateway = sidecarBridge
  ? new VoiceGateway({
    sidecar: sidecarBridge,
    invokeMain: (channel, payload) => ipcRenderer.invoke(channel, payload),
    getApiBaseUrl: () => getJarvisApiUrl(),
    getAccessToken: () => getAccountSession()?.accessToken || null,
    queuePromptExecution,
    executeStructuredCommand,
  })
  : null;

// ── contextBridge exposure ────────────────────────────────────────────────────

contextBridge.exposeInMainWorld('jarvisIpc', {
  /** Call a main-process IPC handler. Only allowed channels work. */
  invoke(channel, ...args) {
    if (!ALLOWED_INVOKE.has(channel)) {
      throw new Error(`[preload] Blocked IPC invoke: ${channel}`);
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
      throw new Error(`[preload] Blocked IPC receive: ${channel}`);
    }
    const wrapper = (_event, ...args) => listener(...args);
    ipcRenderer.on(channel, wrapper);
    return () => ipcRenderer.removeListener(channel, wrapper);
  },
});

contextBridge.exposeInMainWorld('jarvisApi', {
  // ── auth ──────────────────────────────────────────────────────────────────
  getToken,

  // ── backend ───────────────────────────────────────────────────────────────
  connectToBackend,
  executeStructuredCommand,
  getLocalStateSnapshot,
  onMessage,
  onStatus,
  queuePromptExecution,

  // ── local-state ───────────────────────────────────────────────────────────
  addSchedule,
  getSchedules,
  syncToCloud,
  loadFromCloud,

  // ── scheduler ─────────────────────────────────────────────────────────────
  startScheduler,

  // ── accounts ──────────────────────────────────────────────────────────────
  getAccountSession,
  setAccountSession,
  clearAccountSession,
  getLinkedAccounts,
  refreshSessionIfNeeded,

  // ── runtime-config ────────────────────────────────────────────────────────
  getJarvisApiUrl,
  getJarvisWebUrl,
  setJarvisWebUrl,

  // ── sidecar bridge ────────────────────────────────────────────────────────
  // Wraps the SidecarBridge instance so the renderer can subscribe to events
  // and call its API without direct Node access.
  sidecar: sidecarBridge ? {
    /** Subscribe to a sidecar event. Returns an unsubscribe function. */
    on(event, listener) {
      sidecarBridge.on(event, listener);
      return () => sidecarBridge.removeListener(event, listener);
    },
    configure: (settings) => sidecarBridge.configure(settings),
    setListeningForCommand: (active) => sidecarBridge.setListeningForCommand(active),
    startAudioCapture: () => sidecarBridge.startAudioCapture(),
    stopAudioCapture: () => sidecarBridge.stopAudioCapture(),
    requestIntentParse: (text, requestId) => sidecarBridge.requestIntentParse(text, requestId),
    requestTts: (text, requestId) => sidecarBridge.requestTts(text, requestId),
    connect: () => sidecarBridge.connect(),
    /** Returns the current _capturing state. */
    isCapturing: () => Boolean(sidecarBridge._capturing),
  } : null,
  voiceGateway: voiceGateway ? {
    on(event, listener) {
      voiceGateway.on(event, listener);
      return () => voiceGateway.removeListener(event, listener);
    },
    configure: (settings) => voiceGateway.configure(settings),
    connect: () => voiceGateway.connect(),
    startAudioCapture: () => voiceGateway.startAudioCapture(),
    stopAudioCapture: () => voiceGateway.stopAudioCapture(),
    setListeningForCommand: (active) => voiceGateway.setListeningForCommand(active),
    synthesize: (text, options) => voiceGateway.synthesize(text, options),
  } : null,
});

const jarvisApiV2 = buildJarvisApiV2({
  getToken,
  backend: {
    connectToBackend,
    executeStructuredCommand,
    getLocalStateSnapshot,
    onMessage,
    onStatus,
    queuePromptExecution,
  },
  localState: {
    addSchedule,
    getSchedules,
    syncToCloud,
    loadFromCloud,
  },
  scheduler: {
    startScheduler,
  },
  accounts: {
    getAccountSession,
    setAccountSession,
    clearAccountSession,
    getLinkedAccounts,
    refreshSessionIfNeeded,
  },
  runtime: {
    getJarvisApiUrl,
    getJarvisWebUrl,
    setJarvisWebUrl,
  },
  sidecar: sidecarBridge ? {
    on(event, listener) {
      sidecarBridge.on(event, listener);
      return () => sidecarBridge.removeListener(event, listener);
    },
    configure: (settings) => sidecarBridge.configure(settings),
    setListeningForCommand: (active) => sidecarBridge.setListeningForCommand(active),
    startAudioCapture: () => sidecarBridge.startAudioCapture(),
    stopAudioCapture: () => sidecarBridge.stopAudioCapture(),
    requestIntentParse: (text, requestId) => sidecarBridge.requestIntentParse(text, requestId),
    requestTts: (text, requestId) => sidecarBridge.requestTts(text, requestId),
    connect: () => sidecarBridge.connect(),
    isCapturing: () => Boolean(sidecarBridge._capturing),
  } : null,
  voiceGateway: voiceGateway ? {
    on(event, listener) {
      voiceGateway.on(event, listener);
      return () => voiceGateway.removeListener(event, listener);
    },
    configure: (settings) => voiceGateway.configure(settings),
    connect: () => voiceGateway.connect(),
    startAudioCapture: () => voiceGateway.startAudioCapture(),
    stopAudioCapture: () => voiceGateway.stopAudioCapture(),
    setListeningForCommand: (active) => voiceGateway.setListeningForCommand(active),
    synthesize: (text, options) => voiceGateway.synthesize(text, options),
  } : null,
});

contextBridge.exposeInMainWorld('jarvisApiV2', jarvisApiV2);
