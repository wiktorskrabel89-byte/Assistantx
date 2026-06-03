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
  'sidecar:send',
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
  'local-server:list',
  'local-server:add',
  'local-server:update',
  'local-server:remove',
  'local-server:scan',
  'local-server:get-model-assignment',
  'local-server:set-model-assignment',
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
  'mcp:list-servers',
  'mcp:install-server',
  'mcp:uninstall-server',
  'mcp:call-tool',
  'mcp:get-server-status',
  'mcp:google-auth-status',
  'mcp:google-start-auth',
  'mcp:google-poll-auth',
  'mcp:set-api-key',
  'mcp:list-tools',
  'map:get-config',
  'map:fly-to',
  'config:get-engine-mode',
  'config:set-engine-mode',
  'config:get-model-config',
  'config:get-free-model-catalog',
  'config:pick-best-free-model',
  'setup:complete',
  'setup:get-subscription-status',
  'setup:get-recommended-config',
  'secure:set-api-key',
  'secure:get-api-key',
  'secure:clear-api-key',
  // Clipboard monitoring
  'clipboard:get-status',
  'clipboard:enable',
  'clipboard:disable',
  'clipboard:get-last',
  'clipboard:get-history',
  // Drag-and-drop file indexing
  'index:drop-files',
  'index:get-jobs',
  'index:get-job',
  'index:cancel-job',
  'window:minimize',
  'window:toggle-maximize',
  'window:close',
  'hardware:probe',
  'exec:run',
  'exec:list-allowed',
  'health:snapshot',
  'vision:capture-screen',
  'memory:list-recent',
  'memory:save',
]);

const ALLOWED_RECEIVE = new Set([
  'app-meta',
  'auto-update-status',
  'sidecar-status',
  'desktop-health',
  'sidecar-message',
  'auth:session-changed',
  'auth:signed-out',
  'clipboard:change',
  'clipboard:status',
  'index:job-update',
  'splash:progress',
  'auth:login-timeout',
  'auth:login-failed',
  'auth:login-success',
  'exec:chunk',
  'health:pulse',
  'health:heal-attempted',
  'health:heal-outcome',
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
  getEngineMode,
  setEngineMode,
  getJarvisModelConfig,
  setJarvisModelConfig,
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
    ipcMode: runtimeMode === 'remote-linux-runtime' ? 'websocket' : 'stdio',
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
    requestTtsStreamStart: (requestId) => sidecarBridge.requestTtsStreamStart(requestId),
    requestTtsStreamChunk: (text, requestId, chunkIndex, isFinal) => sidecarBridge.requestTtsStreamChunk(text, requestId, chunkIndex, isFinal),
    requestTtsStreamEnd: (requestId) => sidecarBridge.requestTtsStreamEnd(requestId),
    requestTtsStreamCancel: (requestId) => sidecarBridge.requestTtsStreamCancel(requestId),
    requestMemorySearch: (query, requestId, topK) => sidecarBridge.requestMemorySearch(query, requestId, topK),
    requestMemoryUpsert: (text, metadata, requestId) => sidecarBridge.requestMemoryUpsert(text, metadata, requestId),
    requestToolCall: (tool, query, requestId) => sidecarBridge.requestToolCall(tool, query, requestId),
    connect: () => sidecarBridge.connect(),
    setConnection: (connection) => sidecarBridge.setConnection(connection),
    getCapabilities: () => sidecarBridge.getCapabilities(),
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
    map: {
      getConfig: () => invokeAllowed('map:get-config'),
      flyTo: (lat, lon, label) => invokeAllowed('map:fly-to', { lat, lon, label }),
    },
    localServer: {
      list: () => invokeAllowed('local-server:list'),
      add: (payload) => invokeAllowed('local-server:add', payload || {}),
      update: (payload) => invokeAllowed('local-server:update', payload || {}),
      remove: (id) => invokeAllowed('local-server:remove', { id }),
      scan: (id) => invokeAllowed('local-server:scan', { id }),
      getModelAssignment: () => invokeAllowed('local-server:get-model-assignment'),
      setModelAssignment: (payload) => invokeAllowed('local-server:set-model-assignment', payload || {}),
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
    mcp: {
      listServers: () => invokeAllowed('mcp:list-servers'),
      installServer: (serverId) => invokeAllowed('mcp:install-server', { serverId }),
      uninstallServer: (serverId) => invokeAllowed('mcp:uninstall-server', { serverId }),
      callTool: (toolName, params) => invokeAllowed('mcp:call-tool', { toolName, params: params || {} }),
      getServerStatus: (serverId) => invokeAllowed('mcp:get-server-status', { serverId }),
      googleAuthStatus: () => invokeAllowed('mcp:google-auth-status'),
      googleStartAuth: () => invokeAllowed('mcp:google-start-auth'),
      googlePollAuth: (deviceCode) => invokeAllowed('mcp:google-poll-auth', { deviceCode }),
      setApiKey: (serverId, value) => invokeAllowed('mcp:set-api-key', { serverId, value }),
      listTools: () => invokeAllowed('mcp:list-tools'),
    },
    setup: {
      complete: (payload) => invokeAllowed('setup:complete', payload || {}),
      getSubscriptionStatus: () => invokeAllowed('setup:get-subscription-status'),
      getRecommendedConfig: () => invokeAllowed('setup:get-recommended-config'),
      setApiKey: (provider, value) => invokeAllowed('secure:set-api-key', { provider, value }),
      getApiKey: (provider) => invokeAllowed('secure:get-api-key', { provider }),
      clearApiKey: (provider) => invokeAllowed('secure:clear-api-key', { provider }),
    },
    config: {
      getEngineMode: () => invokeAllowed('config:get-engine-mode'),
      setEngineMode: (mode) => invokeAllowed('config:set-engine-mode', { mode }),
      getModelConfig: () => invokeAllowed('config:get-model-config'),
      getFreeModelCatalog: (plan) => invokeAllowed('config:get-free-model-catalog', plan ? { plan } : {}),
      pickBestFreeModel: (profile, plan) => invokeAllowed('config:pick-best-free-model', { profile, plan }),
    },
    splash: {
      onProgress: (listener) => subscribeAllowed('splash:progress', listener),
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
  map: {
    getConfig: () => invokeAllowed('map:get-config'),
    flyTo: (lat, lon, label) => invokeAllowed('map:fly-to', { lat, lon, label }),
  },
  setup: {
    complete: (payload) => invokeAllowed('setup:complete', payload || {}),
    getSubscriptionStatus: () => invokeAllowed('setup:get-subscription-status'),
    getRecommendedConfig: () => invokeAllowed('setup:get-recommended-config'),
    setApiKey: (provider, value) => invokeAllowed('secure:set-api-key', { provider, value }),
    getApiKey: (provider) => invokeAllowed('secure:get-api-key', { provider }),
    clearApiKey: (provider) => invokeAllowed('secure:clear-api-key', { provider }),
  },
  config: {
    getEngineMode: () => invokeAllowed('config:get-engine-mode'),
    setEngineMode: (mode) => invokeAllowed('config:set-engine-mode', { mode }),
    getModelConfig: () => invokeAllowed('config:get-model-config'),
    getFreeModelCatalog: (plan) => invokeAllowed('config:get-free-model-catalog', plan ? { plan } : {}),
    pickBestFreeModel: (profile, plan) => invokeAllowed('config:pick-best-free-model', { profile, plan }),
  },
  localServer: {
    list: () => invokeAllowed('local-server:list'),
    add: (payload) => invokeAllowed('local-server:add', payload || {}),
    update: (payload) => invokeAllowed('local-server:update', payload || {}),
    remove: (id) => invokeAllowed('local-server:remove', { id }),
    scan: (id) => invokeAllowed('local-server:scan', { id }),
    getModelAssignment: () => invokeAllowed('local-server:get-model-assignment'),
    setModelAssignment: (payload) => invokeAllowed('local-server:set-model-assignment', payload || {}),
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
  mcp: {
    listServers: () => invokeAllowed('mcp:list-servers'),
    installServer: (serverId) => invokeAllowed('mcp:install-server', { serverId }),
    uninstallServer: (serverId) => invokeAllowed('mcp:uninstall-server', { serverId }),
    callTool: (toolName, params) => invokeAllowed('mcp:call-tool', { toolName, params: params || {} }),
    getServerStatus: (serverId) => invokeAllowed('mcp:get-server-status', { serverId }),
    googleAuthStatus: () => invokeAllowed('mcp:google-auth-status'),
    googleStartAuth: () => invokeAllowed('mcp:google-start-auth'),
    googlePollAuth: (deviceCode) => invokeAllowed('mcp:google-poll-auth', { deviceCode }),
    setApiKey: (serverId, value) => invokeAllowed('mcp:set-api-key', { serverId, value }),
    listTools: () => invokeAllowed('mcp:list-tools'),
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
  /** Clipboard monitoring (opt-in). Default is disabled; user must call enable(). */
  clipboard: {
    getStatus: () => invokeAllowed('clipboard:get-status'),
    enable: () => invokeAllowed('clipboard:enable'),
    disable: () => invokeAllowed('clipboard:disable'),
    getLast: () => invokeAllowed('clipboard:get-last'),
    getHistory: () => invokeAllowed('clipboard:get-history'),
    /** Subscribe to new clipboard entries (fired only when watcher is enabled). */
    onChange: (listener) => subscribeAllowed('clipboard:change', listener),
    /** Subscribe to enabled/disabled status changes. */
    onStatus: (listener) => subscribeAllowed('clipboard:status', listener),
  },
  /** Drag-and-drop local file indexing. */
  fileIndex: {
    dropFiles: (paths) => invokeAllowed('index:drop-files', { paths: Array.isArray(paths) ? paths : [] }),
    getJobs: () => invokeAllowed('index:get-jobs'),
    getJob: (jobId) => invokeAllowed('index:get-job', { jobId }),
    cancelJob: (jobId) => invokeAllowed('index:cancel-job', { jobId }),
    /** Subscribe to job progress updates. */
    onJobUpdate: (listener) => subscribeAllowed('index:job-update', listener),
  },
});

contextBridge.exposeInMainWorld('jarvisApiV2', buildJarvisApiV2());
