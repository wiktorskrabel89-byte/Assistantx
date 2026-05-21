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
  'updater:get-auth-status',
  'updater:set-token',
  'updater:clear-token',
  'get-jarvis-web-url',
  'set-jarvis-web-url',
  'open-account-login',
  'open-url',
  'open-path',
  'jarvis-ai-request',
  'jarvis-ai-route',
  'setup:check-local-ai',
  'setup:install-local',
  'get-displays',
  'get-desktop-diagnostics',
  'get-local-telemetry',
  'auth:get-session',
  'auth:refresh',
  'auth:sign-out',
  'auth:get-profile',
  'auth:get-device-token',
  'server:get-auth-status',
  'server:clear-auth',
  'server:verify-pairing',
  'server:get-runtime-status',
  'server:set-permission-level',
  'server:kill-switch',
  'server:get-config',
  'server:set-config',
  'tools:launch-game',
  'tools:launch-app',
  'github:set-token',
  'github:clear-token',
  'github:status',
  'github:list-repos',
  'github:get-tree',
  'github:read-file',
  'github:list-commits',
  'github:get-diff',
  'google:login-start',
  'google:login-poll',
  'google:logout',
  'google:status',
  'google:calendar-today',
  'google:gmail-unread',
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
  getRemoteRuntimeWsUrl,
  getRuntimeMode,
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
  const runtimeMode = getRuntimeMode();
  sidecarBridge = new SidecarBridge({
    url: runtimeMode === 'remote-linux-runtime' ? getRemoteRuntimeWsUrl() : undefined,
  });
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
    requestMemorySearch: (query, requestId, topK) => sidecarBridge.requestMemorySearch(query, requestId, topK),
    requestMemoryUpsert: (text, metadata, requestId) => sidecarBridge.requestMemoryUpsert(text, metadata, requestId),
    requestToolCall: (tool, query, requestId) => sidecarBridge.requestToolCall(tool, query, requestId),
    connect: () => sidecarBridge.connect(),
    setConnection: (connection) => sidecarBridge.setConnection(connection),
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
      getRemoteRuntimeWsUrl,
      getRuntimeMode,
      setJarvisWebUrl,
    },
    server: {
      getAuthStatus: () => invokeAllowed('server:get-auth-status'),
      clearAuth: () => invokeAllowed('server:clear-auth'),
      verifyPairing: (syncKey) => invokeAllowed('server:verify-pairing', { syncKey }),
      getRuntimeStatus: () => invokeAllowed('server:get-runtime-status'),
      setPermissionLevel: (level, fullControlConsent = false) => invokeAllowed('server:set-permission-level', { level, fullControlConsent }),
      killSwitch: () => invokeAllowed('server:kill-switch'),
      getConfig: () => invokeAllowed('server:get-config'),
      setConfig: (payload) => invokeAllowed('server:set-config', payload || {}),
    },
    github: {
      setToken: (token) => invokeAllowed('github:set-token', token),
      clearToken: () => invokeAllowed('github:clear-token'),
      getStatus: () => invokeAllowed('github:status'),
      listRepos: (payload) => invokeAllowed('github:list-repos', payload || {}),
      getTree: (payload) => invokeAllowed('github:get-tree', payload || {}),
      readFile: (payload) => invokeAllowed('github:read-file', payload || {}),
      listCommits: (payload) => invokeAllowed('github:list-commits', payload || {}),
      getDiff: (payload) => invokeAllowed('github:get-diff', payload || {}),
    },
    google: {
      loginStart: () => invokeAllowed('google:login-start'),
      loginPoll: (payload) => invokeAllowed('google:login-poll', payload || {}),
      logout: () => invokeAllowed('google:logout'),
      getStatus: () => invokeAllowed('google:status'),
      getCalendarToday: () => invokeAllowed('google:calendar-today'),
      getGmailUnread: (payload) => invokeAllowed('google:gmail-unread', payload || {}),
    },
    tools: {
      launchGame: (payload) => invokeAllowed('tools:launch-game', payload || {}),
      launchApp: (payload) => invokeAllowed('tools:launch-app', payload || {}),
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

contextBridge.exposeInMainWorld('updaterX', {
  onStatus: (listener) => subscribeAllowed('auto-update-status', listener),
  onAvailable: (listener) => subscribeAllowed('auto-update-status', (payload) => {
    if (payload?.status === 'available') listener(payload);
  }),
  onProgress: (listener) => subscribeAllowed('auto-update-status', (payload) => {
    if (payload?.status === 'downloading') {
      listener({
        percent: Number(payload?.downloadProgress || 0),
        detail: payload?.detail || '',
      });
    }
  }),
  onDownloaded: (listener) => subscribeAllowed('auto-update-status', (payload) => {
    if (payload?.status === 'install-ready') listener(payload);
  }),
  onError: (listener) => subscribeAllowed('auto-update-status', (payload) => {
    if (payload?.status === 'error' || payload?.status === 'unavailable') listener(payload);
  }),
  check: () => invokeAllowed('check-for-updates'),
  getState: () => invokeAllowed('get-update-state'),
  download: () => invokeAllowed('download-update'),
  install: () => invokeAllowed('install-update'),
  defer: (reason = 'later', source = 'updaterX') => invokeAllowed('defer-update', { reason, source }),
  getAuthStatus: () => invokeAllowed('updater:get-auth-status'),
  setToken: (token) => invokeAllowed('updater:set-token', token),
  clearToken: () => invokeAllowed('updater:clear-token'),
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
  getRemoteRuntimeWsUrl,
  getRuntimeMode,
  setJarvisWebUrl,
  checkLocalAiSetup: () => invokeAllowed('setup:check-local-ai'),
  installLocalAiEngine: () => invokeAllowed('setup:install-local'),
  server: {
    getAuthStatus: () => invokeAllowed('server:get-auth-status'),
    clearAuth: () => invokeAllowed('server:clear-auth'),
    verifyPairing: (syncKey) => invokeAllowed('server:verify-pairing', { syncKey }),
    getRuntimeStatus: () => invokeAllowed('server:get-runtime-status'),
    setPermissionLevel: (level, fullControlConsent = false) => invokeAllowed('server:set-permission-level', { level, fullControlConsent }),
    killSwitch: () => invokeAllowed('server:kill-switch'),
    getConfig: () => invokeAllowed('server:get-config'),
    setConfig: (payload) => invokeAllowed('server:set-config', payload || {}),
  },
  github: {
    setToken: (token) => invokeAllowed('github:set-token', token),
    clearToken: () => invokeAllowed('github:clear-token'),
    getStatus: () => invokeAllowed('github:status'),
    listRepos: (payload) => invokeAllowed('github:list-repos', payload || {}),
    getTree: (payload) => invokeAllowed('github:get-tree', payload || {}),
    readFile: (payload) => invokeAllowed('github:read-file', payload || {}),
    listCommits: (payload) => invokeAllowed('github:list-commits', payload || {}),
    getDiff: (payload) => invokeAllowed('github:get-diff', payload || {}),
  },
  google: {
    loginStart: () => invokeAllowed('google:login-start'),
    loginPoll: (payload) => invokeAllowed('google:login-poll', payload || {}),
    logout: () => invokeAllowed('google:logout'),
    getStatus: () => invokeAllowed('google:status'),
    getCalendarToday: () => invokeAllowed('google:calendar-today'),
    getGmailUnread: (payload) => invokeAllowed('google:gmail-unread', payload || {}),
  },
  tools: {
    launchGame: (payload) => invokeAllowed('tools:launch-game', payload || {}),
    launchApp: (payload) => invokeAllowed('tools:launch-app', payload || {}),
  },
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
