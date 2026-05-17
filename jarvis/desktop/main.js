const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell, Tray, Menu, nativeImage, autoUpdater: nativeAutoUpdater } = require('electron');
const { getJarvisWebUrl, setJarvisWebUrl } = require('./runtime-config');
const { getToken: getDeviceToken } = require('./auth');
const {
  getAccountProfile,
  getSafeAccountSession,
  loadAccountSession,
  refreshSessionIfNeeded,
  setAccountSession,
  signOutAccountSession,
} = require('./accounts');
const { spawn } = require('child_process');
const launcherService = require('./launcher/launch-service');
const launcherDb = require('./launcher/db');
const { createStartupDiagnostics } = require('./services/startup-diagnostics');
const { createEventBus } = require('./telemetry/event-bus');
const { getLocalTelemetrySnapshot, wireLocalTelemetry } = require('./telemetry/local-telemetry');
const { buildSecureWebPreferences } = require('./electron/main/window-security');
const { createMainIpcHandlers } = require('./electron/ipc/register-main-handlers');
const { createUpdateCoordinator } = require('./electron/updater/coordinator');
const { createPermissionPolicy } = require('./electron/permissions/policy');
const { assertNoDynamicCodeExecution, sanitizeAuditValue } = require('./electron/security/guardrails');
const { emitSessionChanged } = require('./electron/auth/events');
const { redactUrl } = require('./electron/auth/redaction');
const { bindAuthEvents } = require('./electron/auth/sync');
const { generateOAuthState, parseAuthCallback, toSafeSessionView } = require('./electron/auth/validators');
const {
  buildMetadataSignatureUrl,
  classifyInstallerBlocker,
  classifySignatureDiagnostic,
  classifyUpdateVersionSanity,
  extractLatestFeedMetadata,
  isUserWithinStagedRollout,
  validateLatestFeedMetadata,
  verifyDetachedMetadataSignature,
} = require('./electron/updater/feed-metadata');

// ── DB readiness helper ───────────────────────────────────────────────────────
// Ensures the launcher SQLite database is initialised before any IPC handler
// that touches it.  Concurrent callers share the same in-flight promise thanks
// to the deduplication logic inside db.init().
function ensureDbReady() {
  return launcherDb.init();
}

// ── Python AI-Agent sidecar process management ───────────────────────────────
let sidecarProcess = null;
let sidecarStatus = 'idle';
let sidecarHeartbeatInFlight = false;
const SIDECAR_PORT = process.env.JARVIS_SIDECAR_PORT || '8765';
const SIDECAR_HEALTH_TIMEOUT_MS = Number(process.env.JARVIS_SIDECAR_HEALTH_TIMEOUT_MS || 5000);
const SIDECAR_HEALTH_RETRIES = Math.max(1, Number(process.env.JARVIS_SIDECAR_HEALTH_RETRIES || 3));
const startupDiagnostics = createStartupDiagnostics();
const telemetryBus = createEventBus();
wireLocalTelemetry(telemetryBus);

const permissions = createPermissionPolicy({
  onAudit(entry) {
    startupDiagnostics.pushEvent('permissions', 'info', 'Permission policy decision.', entry);
  },
});

function securityAudit(entry = {}) {
  startupDiagnostics.pushEvent('security', 'info', 'Security audit event.', {
    action: sanitizeAuditValue(entry.action, 120),
    target: sanitizeAuditValue(entry.target, 500),
    at: entry.at || new Date().toISOString(),
  });
}

assertNoDynamicCodeExecution('main-process-guardrails', 'main.js bootstrap');

const AUTH_PROTOCOL = 'assistantx';
const AUTH_CALLBACK_URL = `${AUTH_PROTOCOL}://auth/callback`;
const SILENT_REFRESH_INTERVAL_MS = 5 * 60_000;

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

if (process.defaultApp) {
  const appEntry = process.argv[1] ? [path.resolve(process.argv[1])] : [];
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, appEntry);
} else {
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
}

function getSidecarMainPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ai-agent', 'main.py');
  }
  return path.join(__dirname, '..', '..', 'ai-agent', 'main.py');
}

function getPythonExecutable() {
  const sidecarDir = path.dirname(getSidecarMainPath());
  const candidates = [
    // Embedded runtime candidates for packaged Windows builds.
    path.join(process.resourcesPath || '', 'ai-agent', 'runtime', 'python', 'python.exe'),
    path.join(process.resourcesPath || '', 'python', 'python.exe'),
    path.join(sidecarDir, 'venv', 'Scripts', 'python.exe'),
    path.join(sidecarDir, 'venv', 'bin', 'python'),
    'python3',
    'python',
  ];
  for (const candidate of candidates) {
    if (candidate.includes(path.sep) && !fs.existsSync(candidate)) continue;
    return candidate;
  }
  return 'python';
}

function setLauncherPhase(phase, detail, details = {}) {
  startupDiagnostics.setPhase('launcher', phase, detail, details);
}

async function fetchSidecarHealth(timeoutMs = SIDECAR_HEALTH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${SIDECAR_PORT}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Health endpoint returned ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function waitForSidecarHeartbeat() {
  const startedAt = Date.now();
  let lastError = null;
  for (let attempt = 1; attempt <= SIDECAR_HEALTH_RETRIES; attempt += 1) {
    try {
      const payload = await fetchSidecarHealth();
      return {
        ok: true,
        payload,
        startupTimeMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return {
    ok: false,
    reason: lastError?.name === 'AbortError' ? 'health_timeout' : 'health_unreachable',
    error: String(lastError?.message || lastError || 'unknown_error'),
    startupTimeMs: Date.now() - startedAt,
  };
}

function markSidecarListeningForHeartbeat() {
  if (sidecarHeartbeatInFlight) return;
  sidecarHeartbeatInFlight = true;
  setLauncherPhase('starting-api', 'AI runtime API started. Waiting for heartbeat.');
  startupDiagnostics.setComponent('sidecar', 'starting', {
    detail: 'AI runtime started. Waiting for heartbeat.',
    reason: 'waiting_for_heartbeat',
    phase: 'waiting-for-heartbeat',
  });
  void waitForSidecarHeartbeat().then((health) => {
    sidecarHeartbeatInFlight = false;
    if (!sidecarProcess) return;
    if (health.ok) {
      startupDiagnostics.setComponent('sidecar', 'healthy', {
        detail: 'AI runtime healthy and ready.',
        reason: 'heartbeat_ok',
        details: { startupTimeMs: health.startupTimeMs, ...(health.payload || {}) },
        phase: 'healthy',
      });
      startupDiagnostics.setComponent('launcher', 'healthy', {
        detail: 'Launcher initialized AI runtime successfully.',
        reason: 'sidecar_healthy',
        details: { startupTimeMs: health.startupTimeMs },
        phase: 'healthy',
      });
      startupDiagnostics.pushEvent('sidecar', 'info', 'Sidecar heartbeat is healthy.', {
        startupTimeMs: health.startupTimeMs,
      });
      telemetryBus.publish('sidecar.running');
      telemetryBus.publish('startup.healthy');
    } else {
      startupDiagnostics.setComponent('sidecar', 'degraded', {
        detail: 'AI runtime heartbeat failed.',
        reason: health.reason,
        details: {
          startupTimeMs: health.startupTimeMs,
          error: health.error,
        },
        phase: 'waiting-for-heartbeat',
      });
      startupDiagnostics.setComponent('launcher', 'degraded', {
        detail: 'Launcher started sidecar but heartbeat failed.',
        reason: health.reason,
        details: {
          startupTimeMs: health.startupTimeMs,
          error: health.error,
        },
        phase: 'waiting-for-heartbeat',
      });
      startupDiagnostics.pushEvent('sidecar', 'warn', 'Sidecar heartbeat degraded.', {
        reason: health.reason,
        error: health.error,
        startupTimeMs: health.startupTimeMs,
      });
      telemetryBus.publish('startup.degraded');
    }
    emitDesktopHealth();
  });
}

function startSidecar() {
  const mainPy = getSidecarMainPath();
  setLauncherPhase('validating-runtime', 'Validating AI runtime paths.');
  if (!fs.existsSync(mainPy)) {
    sidecarStatus = 'unavailable';
    startupDiagnostics.setComponent('sidecar', 'unavailable', {
      detail: 'AI runtime executable not found.',
      reason: 'main_py_missing',
      details: { mainPy },
    });
    startupDiagnostics.setComponent('launcher', 'degraded', {
      detail: 'Launcher cannot locate sidecar runtime.',
      reason: 'runtime_path_missing',
      details: { mainPy },
      phase: 'validating-runtime',
    });
    startupDiagnostics.pushEvent('sidecar', 'warn', 'Sidecar unavailable: main.py missing.');
    telemetryBus.publish('sidecar.unavailable');
    telemetryBus.publish('startup.unavailable');
    emitDesktopHealth();
    return;
  }

  const python = getPythonExecutable();
  setLauncherPhase('creating-venv', 'Detecting Python runtime environment.', { python });
  setLauncherPhase('loading-models', 'Loading AI runtime models.');
  telemetryBus.publish('sidecar.started');
  startupDiagnostics.setComponent('sidecar', 'starting', {
    detail: 'Starting AI runtime process.',
    reason: 'process_starting',
    details: { python },
    phase: 'starting-api',
  });
  startupDiagnostics.pushEvent('sidecar', 'info', 'Starting sidecar process.', { python });
  telemetryBus.publish('startup.starting');
  emitDesktopHealth();
  sidecarHeartbeatInFlight = false;
  sidecarProcess = spawn(python, [mainPy], {
    env: {
      ...process.env,
      JARVIS_SIDECAR_PORT: SIDECAR_PORT,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  sidecarStatus = 'starting';

  sidecarProcess.stdout?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.log(`[sidecar] ${line}`);
    if (line.includes('listening on')) {
      sidecarStatus = 'running';
      markSidecarListeningForHeartbeat();
    }
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.stderr?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[sidecar:err] ${line}`);
    if (line.includes('listening on')) {
      sidecarStatus = 'running';
      markSidecarListeningForHeartbeat();
    }
    if (/reconnect|retry|re-?connect/i.test(line)) {
      telemetryBus.publish('sidecar.reconnect');
    }
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.on('exit', (code, signal) => {
    console.log(`[sidecar] process exited: code=${code} signal=${signal}`);
    sidecarProcess = null;
    sidecarHeartbeatInFlight = false;
    sidecarStatus = 'stopped';
    startupDiagnostics.setComponent('sidecar', code && code !== 0 ? 'crashed' : 'stopped', {
      detail: `AI runtime stopped (code=${code} signal=${signal}).`,
      reason: code && code !== 0 ? 'sidecar_crash' : 'sidecar_stopped',
      details: { code, signal },
      phase: 'stopped',
    });
    startupDiagnostics.setComponent('launcher', 'degraded', {
      detail: 'Launcher detected sidecar stop.',
      reason: 'sidecar_stopped',
      details: { code, signal },
      phase: 'waiting-for-heartbeat',
    });
    startupDiagnostics.pushEvent('sidecar', 'warn', 'Sidecar process exited.', { code, signal });
    telemetryBus.publish('sidecar.exit');
    telemetryBus.publish('startup.degraded');
    emitDesktopHealth();
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.on('error', (err) => {
    console.error('[sidecar] spawn error:', err.message);
    sidecarStatus = 'error';
    sidecarHeartbeatInFlight = false;
    startupDiagnostics.setComponent('sidecar', 'unavailable', {
      detail: `AI runtime spawn error: ${err.message}`,
      reason: 'spawn_error',
      details: { error: err.message },
      phase: 'starting-api',
    });
    startupDiagnostics.setComponent('launcher', 'degraded', {
      detail: 'Launcher failed to spawn AI runtime.',
      reason: 'spawn_error',
      details: { error: err.message },
      phase: 'starting-api',
    });
    startupDiagnostics.pushEvent('sidecar', 'error', 'Sidecar spawn error.', { message: err.message });
    telemetryBus.publish('sidecar.error');
    telemetryBus.publish('startup.unavailable');
    emitDesktopHealth();
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });
}

function stopSidecar() {
  if (sidecarProcess) {
    try {
      sidecarProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
    sidecarProcess = null;
  }
  sidecarStatus = 'stopped';
  sidecarHeartbeatInFlight = false;
  startupDiagnostics.setComponent('sidecar', 'stopped', {
    detail: 'AI runtime stopped by desktop runtime.',
    reason: 'manual_stop',
    phase: 'stopped',
  });
  startupDiagnostics.pushEvent('sidecar', 'info', 'Sidecar stop requested.');
  emitDesktopHealth();
}

let win;
let overlayWin;
let tray;
const pendingLauncherConfirmations = new Map();
let appIsInstallingUpdate = false;
let updateState = {
  status: 'idle',
  detail: 'Waiting to check for updates.',
  downloaded: false,
  downloadUrl: null,
  version: null,
  releaseNotes: {
    source: 'none',
    highlights: [],
    details: '',
    hasNotes: false,
  },
};
let pendingAuthFlow = null;
let silentRefreshTimer = null;

function sendToRenderer(channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send(channel, payload);
  }
}

function emitDesktopHealth() {
  sendToRenderer('desktop-health', startupDiagnostics.snapshot());
}

function allowWindowCloseForQuit() {
  return Boolean(app.isQuitting || appIsInstallingUpdate);
}

function prepareForQuitAndInstall(version = null) {
  appIsInstallingUpdate = true;
  app.isQuitting = true;
  telemetryBus.publish('updater.install.started', { version: version || updateState.version || null });
}

function resetQuitAndInstallPreparation() {
  appIsInstallingUpdate = false;
}

function emitUpdateStatus(status, detail, extra = {}) {
  updateState = {
    ...updateState,
    status,
    detail,
    ...extra,
  };
  sendToRenderer('auto-update-status', updateState);
  if (tray && !tray.isDestroyed()) {
    if (status === 'available') {
      tray.setToolTip('AssistantX — Update available ⬆️');
    } else if (status === 'install-ready') {
      tray.setToolTip('AssistantX — Restart to install update');
    } else {
      tray.setToolTip('Jarvis Desktop');
    }
  }
}

function getJarvisWebBaseUrl() {
  return getJarvisWebUrl();
}

function getDesktopWindows() {
  return [win, overlayWin].filter((candidate) => candidate && !candidate.isDestroyed());
}

bindAuthEvents(() => getDesktopWindows());

function extractProtocolUrl(argv = []) {
  return argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${AUTH_PROTOCOL}://`)) || null;
}

function getDesktopLoginUrl(state) {
  const loginUrl = new URL('/auth/login', getJarvisWebBaseUrl());
  loginUrl.searchParams.set('client', 'jarvis-desktop');
  loginUrl.searchParams.set('redirect_to', AUTH_CALLBACK_URL);
  loginUrl.searchParams.set('state', state);
  return loginUrl.toString();
}

function settlePendingAuth(result) {
  if (!pendingAuthFlow || pendingAuthFlow.settled) return;
  const flow = pendingAuthFlow;
  pendingAuthFlow = null;
  flow.settled = true;
  flow.resolve(result);
  if (flow.loginWin && !flow.loginWin.isDestroyed()) {
    flow.loginWin.close();
  }
}

async function consumeAuthCallback(url, source = 'browser', { expectedState = null, settlePending = false } = {}) {
  const parsed = parseAuthCallback(url, expectedState ? { expectedState } : {});
  if (!parsed) return false;
  if (parsed.error) {
    console.warn(`[auth] Ignoring invalid OAuth callback from ${source}:`, redactUrl(url));
    return true;
  }
  const savedSession = await setAccountSession(parsed.session, { reason: `login-${source}` });
  if (settlePending) settlePendingAuth(toSafeSessionView(savedSession));
  return true;
}

function watchLoginWindow(loginWin, expectedState = null) {
  const inspectUrl = (url, source = 'browser') => {
    console.log('[auth] inspecting callback candidate:', redactUrl(url));
    void consumeAuthCallback(url, source, {
      expectedState,
      settlePending: true,
    }).catch((error) => {
      console.warn('[auth] Failed to process OAuth callback:', error?.message || error);
    });
  };
  const inspectNavigation = (event, url, source) => {
    if (typeof url === 'string' && url.startsWith(`${AUTH_CALLBACK_URL}#`)) {
      event.preventDefault();
    }
    inspectUrl(url, source);
  };
  loginWin.webContents.on('will-navigate', (event, url) => inspectNavigation(event, url, 'browser-navigate'));
  loginWin.webContents.on('will-redirect', (event, url) => inspectNavigation(event, url, 'browser-redirect'));
  loginWin.webContents.on('did-redirect-navigation', (_event, url) => inspectUrl(url, 'browser-redirect'));
  loginWin.webContents.on('did-navigate', (_event, url) => inspectUrl(url, 'browser-navigate'));
  loginWin.webContents.on('did-navigate-in-page', (_event, url) => inspectUrl(url, 'browser-navigate'));
  loginWin.webContents.on('did-finish-load', () => {
    try {
      inspectUrl(loginWin.webContents.getURL(), 'browser-finish-load');
    } catch {
      // ignore transient navigation state errors
    }
  });
}

function beginDesktopLogin({ parentWindow } = {}) {
  if (pendingAuthFlow?.promise) {
    if (pendingAuthFlow.loginWin && !pendingAuthFlow.loginWin.isDestroyed()) {
      pendingAuthFlow.loginWin.show();
      pendingAuthFlow.loginWin.focus();
    }
    return pendingAuthFlow.promise;
  }

  const state = generateOAuthState();
  const loginUrl = getDesktopLoginUrl(state);
  const loginWin = new BrowserWindow({
    width: 480,
    height: 680,
    title: 'Sign in to AssistantX',
    parent: parentWindow || undefined,
    modal: true,
    webPreferences: buildSecureWebPreferences(),
  });

  const promise = new Promise((resolve) => {
    pendingAuthFlow = {
      state,
      resolve,
      promise: null,
      loginWin,
      settled: false,
    };
  });
  pendingAuthFlow.promise = promise;

  loginWin.on('closed', () => settlePendingAuth(null));
  watchLoginWindow(loginWin, state);
  loginWin.loadURL(loginUrl);
  return promise;
}

async function handleProtocolCallback(url, source = 'protocol') {
  if (!url) return false;
  const consumed = await consumeAuthCallback(url, source, {
    expectedState: pendingAuthFlow?.state || null,
    settlePending: Boolean(pendingAuthFlow),
  });
  if (consumed && win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  return consumed;
}

async function restoreAuthSession() {
  const storedSession = await loadAccountSession();
  if (!storedSession?.accessToken) return null;
  const refreshedSession = await refreshSessionIfNeeded({ reason: 'restore' });
  if (refreshedSession?.accessToken) {
    if (refreshedSession.accessToken === storedSession.accessToken) {
      emitSessionChanged(refreshedSession, { reason: 'restore' });
    }
    return refreshedSession;
  }
  return null;
}

function startSilentRefreshLoop() {
  if (silentRefreshTimer) clearInterval(silentRefreshTimer);
  silentRefreshTimer = setInterval(() => {
    void refreshSessionIfNeeded({ reason: 'silent-refresh' }).catch((error) => {
      console.warn('[auth] Silent refresh failed:', error?.message || error);
    });
  }, SILENT_REFRESH_INTERVAL_MS);
}

function stopSilentRefreshLoop() {
  if (silentRefreshTimer) {
    clearInterval(silentRefreshTimer);
    silentRefreshTimer = null;
  }
}

// ── updater coordinator integration ───────────────────────────────────────────
let updateCoordinator = null;

function ensureUpdateCoordinator() {
  if (updateCoordinator) return updateCoordinator;
  updateCoordinator = createUpdateCoordinator({
    app,
    startupDiagnostics,
    telemetryBus,
    onHealth: emitDesktopHealth,
    onState(nextState) {
      emitUpdateStatus(nextState.status, nextState.detail, nextState);
    },
  });
  return updateCoordinator;
}

function getAutoUpdater() {
  return ensureUpdateCoordinator().getAutoUpdater();
}

function checkForUpdates(source = 'manual') {
  return ensureUpdateCoordinator().check({ source });
}

function downloadUpdate(source = 'user') {
  return ensureUpdateCoordinator().download({ source });
}

function installUpdate(source = 'user') {
  return ensureUpdateCoordinator().install({ source });
}

function deferUpdate(reason = 'later', source = 'user') {
  return ensureUpdateCoordinator().defer({ reason, source });
}

function getUpdateState() {
  return updateState;
}

function setupAutoUpdater() {
  ensureUpdateCoordinator().setup();
}

function getTrayIcon() {
  const candidates = [
    path.join(__dirname, 'tray-icon.png'),
    path.join(__dirname, 'tray-icon.ico'),
  ];
  const iconPath = candidates.find((candidate) => fs.existsSync(candidate));
  return iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    title: 'Jarvis Desktop',
    webPreferences: buildSecureWebPreferences({ preload: path.join(__dirname, 'preload.js') }),
  });

  win.loadFile('index.html');

  win.webContents.on('did-finish-load', () => {
    sendToRenderer('app-meta', {
      version: app.getVersion(),
      packaged: app.isPackaged,
    });
    sendToRenderer('auto-update-status', updateState);
    sendToRenderer('desktop-health', startupDiagnostics.snapshot());
    const safeSession = getSafeAccountSession();
    if (safeSession) {
      sendToRenderer('auth:session-changed', {
        session: safeSession,
        reason: 'window-ready',
      });
    }
  });

  win.on('close', (event) => {
    if (!allowWindowCloseForQuit()) {
      event.preventDefault();
      win.hide();
    }
  });
}

function createLauncherOverlayWindow() {
  overlayWin = new BrowserWindow({
    width: 640,
    height: 460,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'AssistantX Launcher',
    webPreferences: buildSecureWebPreferences({ preload: path.join(__dirname, 'launcher-preload.js') }),
  });

  overlayWin.loadFile('launcher-overlay.html');
  overlayWin.webContents.on('did-finish-load', () => {
    overlayWin.webContents.send('sidecar-status', { status: sidecarStatus });
    overlayWin.webContents.send('desktop-health', startupDiagnostics.snapshot());
  });
  overlayWin.on('blur', () => {
    if (pendingLauncherConfirmations.size === 0 && !overlayWin.webContents.isDevToolsOpened()) {
      overlayWin.hide();
    }
  });
  overlayWin.on('close', (event) => {
    if (!allowWindowCloseForQuit()) {
      event.preventDefault();
      overlayWin.hide();
    }
  });
}

async function showLauncherOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) createLauncherOverlayWindow();
  const [recent, providerStatus, catalogHealth] = await Promise.all([
    Promise.resolve(launcherService.getRecentApps(8)),
    Promise.resolve(launcherService.getProviderStatus()),
    Promise.resolve(launcherService.getCatalogHealth()),
  ]);
  overlayWin.show();
  overlayWin.focus();
  overlayWin.webContents.send('launcher-overlay-focus', { recent, providerStatus, catalogHealth });
}

function toggleLauncherOverlay() {
  if (overlayWin?.isVisible()) {
    overlayWin.hide();
    return;
  }
  void showLauncherOverlay();
}

function registerLauncherShortcut() {
  const accelerator = process.platform === 'darwin' ? 'CommandOrControl+Space' : 'Control+Space';
  globalShortcut.unregisterAll();
  globalShortcut.register(accelerator, () => {
    toggleLauncherOverlay();
  });
}

async function maybePromptEverythingRecommendation() {
  if (!launcherService.shouldRecommendEverything()) return;
  const parentWindow = overlayWin && overlayWin.isVisible() ? overlayWin : win ?? null;
  const { response } = await dialog.showMessageBox(parentWindow, {
    type: 'question',
    title: 'Install Everything Search?',
    message: 'Install Everything Search for dramatically faster local search?',
    detail: [
      'Benefits:',
      '• instant app launching',
      '• ultra-fast file search',
      '• lower CPU usage',
      '• better Jarvis responsiveness',
      '',
      'AssistantX works without it, but performance improves significantly with Everything installed.',
    ].join('\n'),
    buttons: ['Install Everything', 'Maybe Later', "Don't Ask Again"],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    await shell.openExternal('https://www.voidtools.com/downloads/');
    launcherService.remindLaterForEverything();
    return;
  }
  if (response === 2) {
    launcherService.disableEverythingRecommendation();
    return;
  }
  launcherService.remindLaterForEverything();
}

function createTray() {
  tray = new Tray(getTrayIcon());

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Jarvis', click: () => win.show() },
    { label: 'Open Launcher', click: () => toggleLauncherOverlay() },
    { label: 'Check for updates', click: () => void checkForUpdates('tray-manual') },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setToolTip('Jarvis Desktop');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
    }
  });
}

function getSidecarStatus() {
  return sidecarStatus;
}

function restartSidecarNow() {
  stopSidecar();
  telemetryBus.publish('sidecar.restart');
  setTimeout(() => startSidecar(), 500);
}

createMainIpcHandlers({
  ipcMain,
  app,
  shell,
  launcherService,
  ensureDbReady,
  getSidecarStatus,
  restartSidecar: restartSidecarNow,
  startupDiagnostics,
  getLocalTelemetrySnapshot,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  deferUpdate,
  getUpdateState,
  getJarvisWebUrl,
  setJarvisWebUrl,
  telemetryBus,
  emitDesktopHealth,
  getAuthSessionView: () => getSafeAccountSession(),
  getDeviceToken,
  refreshAuthSession: async () => toSafeSessionView(await refreshSessionIfNeeded({ reason: 'ipc-refresh' })),
  signOutAccountSession: async (meta) => signOutAccountSession(meta),
  getAccountProfile: async () => getAccountProfile(),
  beginDesktopLogin,
  getMainWindow: () => win,
  getOverlayWindow: () => overlayWin,
  createLauncherOverlayWindow,
  prepareForQuitAndInstall,
  resetQuitAndInstallPreparation,
  pendingLauncherConfirmations,
  permissions,
  securityAudit,
});

module.exports = {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  deferUpdate,
  getUpdateState,
  getAutoUpdater,
  setupAutoUpdater,
  emitUpdateStatus,
};

app.on('open-url', (event, url) => {
  event.preventDefault();
  void handleProtocolCallback(url, 'open-url');
});

app.on('second-instance', (_event, argv) => {
  const protocolUrl = extractProtocolUrl(argv);
  if (protocolUrl) {
    void handleProtocolCallback(protocolUrl, 'second-instance');
  }
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

app.on('before-quit', () => {
  app.isQuitting = true;
});

nativeAutoUpdater?.on?.('before-quit-for-update', () => {
  prepareForQuitAndInstall(updateState.version || _validatedFeedMetadata?.version || null);
});

app.whenReady().then(async () => {
  telemetryBus.publish('updater.session.started', { currentVersion: app.getVersion() });
  setLauncherPhase('validating-runtime', 'Validating launcher runtime.');
  const startupProtocolUrl = extractProtocolUrl(process.argv);
  if (startupProtocolUrl) {
    void handleProtocolCallback(startupProtocolUrl, 'startup-argv');
  }
  // Initialise the SQLite database (sql.js loads its WASM binary asynchronously)
  // before any launcher or IPC code touches it.
  try {
    await require('./launcher/db').init();
    startupDiagnostics.setComponent('db', 'healthy', {
      detail: 'Database initialized successfully.',
      reason: 'db_ready',
      phase: 'healthy',
    });
    startupDiagnostics.pushEvent('startup', 'info', 'Launcher DB initialization completed.');
    telemetryBus.publish('startup.healthy');
  } catch (err) {
    console.error('[db] Failed to initialise database:', err.message);
    startupDiagnostics.setComponent('db', 'unavailable', {
      detail: `Database initialization failed: ${err.message}`,
      reason: 'db_init_failed',
      details: { error: err.message },
      phase: 'validating-runtime',
    });
    startupDiagnostics.pushEvent('startup', 'error', 'Launcher DB initialization failed.', { message: err.message });
    telemetryBus.publish('startup.unavailable');
  }
  emitDesktopHealth();
  await restoreAuthSession();
  startSilentRefreshLoop();
  startSidecar();
  createWindow();
  createLauncherOverlayWindow();
  createTray();
  registerLauncherShortcut();
  setupAutoUpdater();
  setLauncherPhase('loading-models', 'Loading AI runtime models.');
  launcherService.refreshCatalog({ reason: 'app-ready' })
    .then(() => {
      startupDiagnostics.setComponent('launcher', 'healthy', {
        detail: 'Launcher catalog refreshed.',
        reason: 'catalog_ready',
        phase: 'healthy',
      });
      startupDiagnostics.pushEvent('launcher', 'info', 'Launcher catalog refresh completed.');
      telemetryBus.publish('startup.healthy');
      emitDesktopHealth();
      return maybePromptEverythingRecommendation();
    })
    .catch((error) => {
      console.warn('[launcher] startup refresh failed:', error.message);
      startupDiagnostics.setComponent('launcher', 'degraded', {
        detail: `Launcher catalog refresh failed: ${error.message}`,
        reason: 'catalog_refresh_failed',
        details: { error: error.message },
        phase: 'loading-models',
      });
      startupDiagnostics.pushEvent('launcher', 'warn', 'Launcher refresh failed.', { message: error.message });
      telemetryBus.publish('startup.degraded');
      emitDesktopHealth();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopSidecar();
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopSilentRefreshLoop();
  stopSidecar();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    win.show();
  }
  void checkForUpdates('activate-manual');
});
