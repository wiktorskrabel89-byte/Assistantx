// jarvis/desktop/preload.js
// Runs in a privileged Node context (renderer process, before page scripts).
// Exposes a locked-down surface to the renderer via contextBridge so the main
// window can use nodeIntegration: false / contextIsolation: true — meaning any
// XSS in the renderer cannot reach Node.js, the filesystem, or shell.

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── IPC channel allow-lists ───────────────────────────────────────────────────
const ALLOWED_INVOKE = new Set([
  'get-app-meta',
  'get-sidecar-status',
  'restart-sidecar',
  'check-for-updates',
  'get-update-state',
  'download-update',
  'install-update',
  'defer-update',
  'get-jarvis-web-url',
  'set-jarvis-web-url',
  'open-account-login',
  'open-url',
  'open-path',
  'jarvis-ai-request',
  'get-displays',
  'get-desktop-diagnostics',
  'get-local-telemetry',
  'auth:get-session',
  'auth:refresh',
  'auth:sign-out',
  'auth:get-profile',
  'auth:get-device-token',
]);

const ALLOWED_RECEIVE = new Set([
  'app-meta',
  'auto-update-status',
  'sidecar-status',
  'desktop-health',
  'auth:session-changed',
  'auth:signed-out',
]);

// ── Node module imports ───────────────────────────────────────────────────────
const {
  connectToBackend,
  executeStructuredCommand,
  getLocalStateSnapshot,
  onMessage,
  onStatus,
  queuePromptExecution,
} = require('./backend');

const localStateModule = require('./local-state');
const {
  addSchedule,
  getSchedules,
  saveReminder,
  getReminders,
  markReminderCompleted,
} = localStateModule;
const { startScheduler } = require('./scheduler');
const { startReminderScheduler } = require('./reminder-scheduler');

const {
  getAccountSession,
  getLinkedAccounts,
} = require('./accounts');

const {
  getJarvisApiUrl,
  getJarvisWebUrl,
  setJarvisWebUrl,
} = require('./runtime-config');

const { VoiceGateway } = require('./voice-gateway');
const { buildTemporalContext } = require('./electron/temporal/context');
const { buildContextualGreeting } = require('./electron/temporal/greetings');
const { parseRelativeTime } = require('./electron/temporal/parse-relative-time');
const { enhanceSpeechText, formatReminderSpeech } = require('./electron/temporal/enhancer');
const { buildDailySummary } = require('./electron/temporal/daily-summary');

function invokeAllowed(channel, ...args) {
  if (!ALLOWED_INVOKE.has(channel)) {
    throw new Error(`[preload] Blocked IPC invoke: ${channel}`);
  }
  return ipcRenderer.invoke(channel, ...args);
}

function subscribeAllowed(channel, listener) {
  if (!ALLOWED_RECEIVE.has(channel)) {
    throw new Error(`[preload] Blocked IPC receive: ${channel}`);
  }
  const wrapper = (_event, ...args) => listener(...args);
  ipcRenderer.on(channel, wrapper);
  return () => ipcRenderer.removeListener(channel, wrapper);
}

const authApi = {
  getSession: () => invokeAllowed('auth:get-session'),
  refresh: () => invokeAllowed('auth:refresh'),
  signOut: () => invokeAllowed('auth:sign-out'),
  getProfile: () => invokeAllowed('auth:get-profile'),
  onSessionChanged: (listener) => subscribeAllowed('auth:session-changed', listener),
  onSignedOut: (listener) => subscribeAllowed('auth:signed-out', listener),
};

const localState = {
  addSchedule,
  getSchedules,
  saveReminder,
  getReminders,
  markReminderCompleted,
  syncToCloud: (apiUrl, options) => {
    const accessToken = getAccountSession()?.accessToken || null;
    return localStateModule.syncToCloud(apiUrl, accessToken, options);
  },
  loadFromCloud: (apiUrl) => {
    const accessToken = getAccountSession()?.accessToken || null;
    return localStateModule.loadFromCloud(apiUrl, accessToken);
  },
};

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

function buildSidecarApi() {
  if (!sidecarBridge) return null;
  return {
    on(event, listener) {
      sidecarBridge.on(event, listener);
      return () => sidecarBridge.removeListener(event, listener);
    },
    configure: (settings) => sidecarBridge.configure(settings),
    setListeningForCommand: (active) => sidecarBridge.setListeningForCommand(active),
    startAudioCapture: () => sidecarBridge.startAudioCapture(),
    stopAudioCapture: () => sidecarBridge.stopAudioCapture(),
    disconnect: () => sidecarBridge.disconnect(),
    requestIntentParse: (text, requestId) => sidecarBridge.requestIntentParse(text, requestId),
    requestTts: (text, requestId) => sidecarBridge.requestTts(text, requestId),
    connect: () => sidecarBridge.connect(),
    isCapturing: () => Boolean(sidecarBridge._capturing),
  };
}

function buildVoiceGatewayApi() {
  if (!voiceGateway) return null;
  return {
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
    interrupt: (reason) => voiceGateway.interrupt(reason),
  };
}

function buildJarvisApiV2() {
  return {
    auth: {
      ...authApi,
      getLinkedAccounts,
    },
    backend: {
      connectToBackend,
      executeStructuredCommand,
      getLocalStateSnapshot,
      onMessage,
      onStatus,
      queuePromptExecution,
    },
    localState,
    scheduler: {
      startScheduler,
      startReminderScheduler,
    },
    accounts: {
      getLinkedAccounts,
    },
    runtime: {
      getJarvisApiUrl,
      getJarvisWebUrl,
      setJarvisWebUrl,
    },
    voice: {
      sidecar: buildSidecarApi(),
      gateway: buildVoiceGatewayApi(),
    },
    temporal: {
      getContext: (options) => buildTemporalContext(options),
      getGreeting: (options) => buildContextualGreeting(options),
      parseRelativeTime: (input, options) => parseRelativeTime(input, options),
      enhanceSpeechText: (text, options) => enhanceSpeechText(text, options),
      formatReminderSpeech: (reminder, options) => formatReminderSpeech(reminder, options),
      buildDailySummary: (payload) => buildDailySummary(payload),
    },
  };
}

contextBridge.exposeInMainWorld('jarvisIpc', {
  invoke: invokeAllowed,
  on: subscribeAllowed,
});

contextBridge.exposeInMainWorld('jarvisApi', {
  getToken: () => invokeAllowed('auth:get-device-token'),
  connectToBackend,
  executeStructuredCommand,
  getLocalStateSnapshot,
  onMessage,
  onStatus,
  queuePromptExecution,
  addSchedule,
  getSchedules,
  saveReminder,
  getReminders,
  markReminderCompleted,
  syncToCloud: localState.syncToCloud,
  loadFromCloud: localState.loadFromCloud,
  startScheduler,
  startReminderScheduler,
  getLinkedAccounts,
  getAccountSession: authApi.getSession,
  refreshSessionIfNeeded: authApi.refresh,
  getJarvisApiUrl,
  getJarvisWebUrl,
  setJarvisWebUrl,
  auth: {
    ...authApi,
    getLinkedAccounts,
  },
  sidecar: buildSidecarApi(),
  voiceGateway: buildVoiceGatewayApi(),
  temporal: {
    getContext: (options) => buildTemporalContext(options),
    getGreeting: (options) => buildContextualGreeting(options),
    parseRelativeTime: (input, options) => parseRelativeTime(input, options),
    enhanceSpeechText: (text, options) => enhanceSpeechText(text, options),
    formatReminderSpeech: (reminder, options) => formatReminderSpeech(reminder, options),
    buildDailySummary: (payload) => buildDailySummary(payload),
  },
});

contextBridge.exposeInMainWorld('jarvisApiV2', buildJarvisApiV2());
