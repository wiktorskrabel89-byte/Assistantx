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
const SIDECAR_PORT = process.env.JARVIS_SIDECAR_PORT || '8765';
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

function startSidecar() {
  const mainPy = getSidecarMainPath();
  if (!fs.existsSync(mainPy)) {
    sidecarStatus = 'unavailable';
    startupDiagnostics.setComponent('sidecar', 'unavailable', 'Sidecar main.py not found.');
    startupDiagnostics.pushEvent('sidecar', 'warn', 'Sidecar unavailable: main.py missing.');
    telemetryBus.publish('sidecar.unavailable');
    telemetryBus.publish('startup.unavailable');
    emitDesktopHealth();
    return;
  }

  const python = getPythonExecutable();
  telemetryBus.publish('sidecar.started');
  startupDiagnostics.setComponent('sidecar', 'degraded', `Starting sidecar using ${python}.`);
  startupDiagnostics.pushEvent('sidecar', 'info', 'Starting sidecar process.', { python });
  telemetryBus.publish('startup.degraded');
  emitDesktopHealth();
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
      startupDiagnostics.setComponent('sidecar', 'healthy', 'Sidecar listening for connections.');
      startupDiagnostics.pushEvent('sidecar', 'info', 'Sidecar is running.');
      telemetryBus.publish('sidecar.running');
      telemetryBus.publish('startup.healthy');
      emitDesktopHealth();
    }
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.stderr?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[sidecar:err] ${line}`);
    if (line.includes('listening on')) {
      sidecarStatus = 'running';
      startupDiagnostics.setComponent('sidecar', 'healthy', 'Sidecar listening for connections.');
      startupDiagnostics.pushEvent('sidecar', 'info', 'Sidecar is running.');
      telemetryBus.publish('sidecar.running');
      telemetryBus.publish('startup.healthy');
      emitDesktopHealth();
    }
    if (/reconnect|retry|re-?connect/i.test(line)) {
      telemetryBus.publish('sidecar.reconnect');
    }
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.on('exit', (code, signal) => {
    console.log(`[sidecar] process exited: code=${code} signal=${signal}`);
    sidecarProcess = null;
    sidecarStatus = 'stopped';
    startupDiagnostics.setComponent('sidecar', 'degraded', `Sidecar stopped (code=${code} signal=${signal}).`);
    startupDiagnostics.pushEvent('sidecar', 'warn', 'Sidecar process exited.', { code, signal });
    telemetryBus.publish('sidecar.exit');
    telemetryBus.publish('startup.degraded');
    emitDesktopHealth();
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.on('error', (err) => {
    console.error('[sidecar] spawn error:', err.message);
    sidecarStatus = 'error';
    startupDiagnostics.setComponent('sidecar', 'unavailable', `Sidecar spawn error: ${err.message}`);
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
  startupDiagnostics.setComponent('sidecar', 'degraded', 'Sidecar stopped by desktop runtime.');
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
    if (status === 'update-available' && extra?.version) {
      tray.setToolTip(`Jarvis Desktop — Update ${extra.version} available ⬆️`);
    } else if (status !== 'update-available') {
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

// ── electron-updater integration ─────────────────────────────────────────────
// autoUpdater reads publish config from package.json (generic/public feed in
// production) and handles detection, download, and install.
let _autoUpdater = null;
let _updaterPublishConfig = null;
let _updaterMetadataPublicKey = undefined;
let _validatedFeedMetadata = null;
const UPDATER_FEED_SELF_TEST_TIMEOUT_MS = 8000;
const UPDATER_METADATA_PUBLIC_KEY_PATH = path.join(__dirname, 'electron', 'updater', 'feed-public-key.pem');

function logUpdaterEvent(event, payload = {}) {
  try {
    console.info(`[updater] ${event}`, JSON.stringify(payload));
  } catch {
    console.info(`[updater] ${event}`);
  }
}

function getUpdaterPublishConfig() {
  if (_updaterPublishConfig) return _updaterPublishConfig;
  try {
    const pkg = require('./package.json');
    const publish = Array.isArray(pkg?.build?.publish) ? pkg.build.publish : [];
    const first = publish[0] || {};
    _updaterPublishConfig = {
      provider: String(first.provider || 'unknown'),
      url: typeof first.url === 'string' ? first.url : '',
      owner: typeof first.owner === 'string' ? first.owner : '',
      repo: typeof first.repo === 'string' ? first.repo : '',
      releaseType: typeof first.releaseType === 'string' ? first.releaseType : '',
    };
  } catch {
    _updaterPublishConfig = {
      provider: 'unknown',
      url: '',
      owner: '',
      repo: '',
      releaseType: '',
    };
  }
  return _updaterPublishConfig;
}

function toFeedMetadataUrl(publish) {
  if (!publish || publish.provider !== 'generic' || !publish.url) return null;
  const base = String(publish.url).trim().replace(/\/+$/, '');
  return `${base}/latest.yml`;
}

function toFeedSignatureUrl(publish) {
  return buildMetadataSignatureUrl(toFeedMetadataUrl(publish));
}

function getUpdaterMetadataPublicKey() {
  if (_updaterMetadataPublicKey !== undefined) return _updaterMetadataPublicKey;
  const envKey = String(process.env.JARVIS_UPDATER_METADATA_PUBLIC_KEY || '').trim();
  if (envKey) {
    _updaterMetadataPublicKey = envKey;
    return _updaterMetadataPublicKey;
  }
  try {
    const bundledKey = fs.readFileSync(UPDATER_METADATA_PUBLIC_KEY_PATH, 'utf8').trim();
    _updaterMetadataPublicKey = bundledKey || null;
  } catch {
    _updaterMetadataPublicKey = null;
  }
  return _updaterMetadataPublicKey;
}

function buildUpdaterContext(updater) {
  const publish = getUpdaterPublishConfig();
  return {
    appVersion: app.getVersion(),
    packaged: app.isPackaged,
    arch: process.arch,
    platform: process.platform,
    channel: String(updater?.channel || 'latest'),
    provider: publish.provider,
    feedUrl: publish.url || null,
    metadataUrl: toFeedMetadataUrl(publish),
    signatureUrl: toFeedSignatureUrl(publish),
    githubOwner: publish.owner || null,
    githubRepo: publish.repo || null,
    githubReleaseType: publish.releaseType || null,
    metadataSignatureConfigured: Boolean(getUpdaterMetadataPublicKey()),
  };
}

function toUpdaterErrorMetadata(err) {
  const message = String(err?.message || err || 'Unknown updater error');
  const code = typeof err?.code === 'string' || typeof err?.code === 'number'
    ? String(err.code)
    : null;
  const statusCodeRaw = err?.statusCode ?? err?.status ?? err?.response?.status;
  const statusCode = Number.isFinite(Number(statusCodeRaw)) ? Number(statusCodeRaw) : null;
  const lower = `${message} ${code || ''}`.toLowerCase();
  const signatureDiagnostic = classifySignatureDiagnostic(lower);
  const installerBlocker = classifyInstallerBlocker(lower);
  const exitCodeMatch = lower.match(/exit code[:=\s]+(-?\d+)/);
  return {
    message,
    code,
    statusCode,
    isNetwork: /network|fetch|econnrefused|enotfound|ehostunreach|timeout|eai_again|socket hang up|etimedout|err_name_not_resolved|name_not_resolved|dns/.test(lower),
    isAuth: /401|403|unauthorized|forbidden|bad credentials|token|authentication/.test(lower) || statusCode === 401 || statusCode === 403,
    isNoRelease: /no published versions? on github|no published releases? on github/.test(lower),
    isMetadataIssue: /latest\.yml|yaml|cannot parse|invalid update info|blockmap|sha512|checksum/.test(lower),
    isSignatureIssue: /signature|code sign|publisher name|certificate|trust chain|unable to verify|digital signature|authenticode/.test(lower),
    isInstallerExecutionIssue: /quitandinstall|installer|elevat|spawn|access is denied|eperm|execution failed|windows cannot access/.test(lower),
    isDownloadIssue: /download|differential/i.test(lower),
    signatureDiagnostic,
    installerBlocker,
    installerExitCode: exitCodeMatch ? Number(exitCodeMatch[1]) : null,
  };
}

function classifyUpdaterFailure(errorMeta, updaterContext) {
  if (errorMeta.isSignatureIssue) {
    return {
        status: 'error',
        health: 'unavailable',
        severity: 'error',
        reason: 'signature-validation-failed',
        detail: errorMeta.signatureDiagnostic === 'unsigned-installer'
          ? 'Downloaded installer is unsigned. Verify release signing before publishing.'
          : errorMeta.signatureDiagnostic === 'certificate-expired'
            ? 'Installer certificate is expired. Renew the signing certificate or timestamp chain.'
            : errorMeta.signatureDiagnostic === 'certificate-revoked'
              ? 'Installer certificate appears revoked. Re-sign the release with a valid certificate.'
              : errorMeta.signatureDiagnostic === 'timestamp-invalid'
                ? 'Installer timestamp validation failed. Verify the timestamp service and signing pipeline.'
                : errorMeta.signatureDiagnostic === 'smartscreen-reputation'
                  ? 'Windows SmartScreen blocked the installer. Verify signing reputation and distribution policy.'
                  : 'Update signature verification failed. Verify Windows code signing certificate and release metadata parity.',
      };
  }
  if (errorMeta.installerBlocker === 'file-lock-detected') {
    return {
      status: 'error',
      health: 'unavailable',
      severity: 'error',
      reason: 'installer-lock-detected',
      detail: 'Installer launch was blocked by a file lock or another running process.',
    };
  }
  if (errorMeta.installerBlocker === 'security-software-block') {
    return {
      status: 'error',
      health: 'unavailable',
      severity: 'error',
      reason: 'installer-blocked-by-security-software',
      detail: 'Installer launch was blocked by antivirus or endpoint security software.',
    };
  }
  if (errorMeta.isInstallerExecutionIssue && updateState.status === 'installing') {
    return {
      status: 'error',
      health: 'unavailable',
      severity: 'error',
      reason: 'installer-execution-failed',
      detail: errorMeta.installerBlocker === 'app-still-running'
        ? 'Update installer execution failed because the app is still running.'
        : 'Update installer execution failed after download.',
    };
  }
  if (errorMeta.isDownloadIssue || updateState.status === 'downloading') {
    return {
      status: 'error',
      health: 'degraded',
      severity: 'warn',
      reason: 'update-download-failed',
      detail: 'Update download failed before installation.',
    };
  }
  if (errorMeta.isNoRelease) {
    return {
      status: 'up-to-date',
      health: 'healthy',
      severity: 'info',
      reason: 'no-published-release',
      detail: 'No published update release was found yet.',
    };
  }
  if (errorMeta.isNetwork) {
    return {
      status: 'unavailable',
      health: 'degraded',
      severity: 'warn',
      reason: 'network-unavailable',
      detail: 'Update check is temporarily unavailable (network).',
    };
  }
  if (errorMeta.isAuth || (updaterContext.provider === 'github' && errorMeta.statusCode === 404)) {
    return {
      status: 'error',
      health: 'unavailable',
      severity: 'error',
      reason: 'feed-auth-or-permission',
      detail: 'Update feed authentication/permission failed. Verify feed visibility and credentials.',
    };
  }
  if (errorMeta.isMetadataIssue || errorMeta.statusCode === 404) {
    return {
      status: 'error',
      health: 'unavailable',
      severity: 'error',
      reason: 'feed-metadata-invalid-or-missing',
      detail: 'Update metadata is missing or invalid (latest.yml / artifact mismatch).',
    };
  }
  return {
    status: 'error',
    health: 'unavailable',
    severity: 'error',
    reason: 'updater-error',
    detail: `Update error: ${errorMeta.message}`,
  };
}

function classifyFeedSelfTestFailure({ statusCode = null, message = '', code = null } = {}) {
  const lower = `${message} ${code || ''}`.toLowerCase();
  if (statusCode === 404) {
    return {
      health: 'unavailable',
      severity: 'error',
      reason: 'feed-metadata-missing',
      detail: 'Updater feed is reachable but latest.yml is missing (404).',
    };
  }
  if (statusCode === 401 || statusCode === 403) {
    return {
      health: 'unavailable',
      severity: 'error',
      reason: 'feed-auth-or-permission',
      detail: 'Updater feed returned an authentication/permission error.',
    };
  }
  if (statusCode !== null && statusCode >= 400) {
    return {
      health: 'unavailable',
      severity: 'error',
      reason: 'feed-http-error',
      detail: `Updater feed returned HTTP ${statusCode}.`,
    };
  }
  if (/err_name_not_resolved|name_not_resolved|enotfound|dns|eai_again/.test(lower)) {
    return {
      health: 'degraded',
      severity: 'warn',
      reason: 'feed-dns-failure',
      detail: 'Updater feed DNS lookup failed.',
    };
  }
  if (/offline|network|fetch|econnrefused|ehostunreach|socket hang up|etimedout|timeout/.test(lower)) {
    return {
      health: 'degraded',
      severity: 'warn',
      reason: 'feed-offline',
      detail: 'Updater feed is temporarily unreachable (offline/network).',
    };
  }
  if (/yaml|latest\.yml|invalid update info|cannot parse/.test(lower)) {
    return {
      health: 'unavailable',
      severity: 'error',
      reason: 'feed-invalid-yaml',
      detail: 'Updater metadata is invalid (latest.yml parsing/format error).',
    };
  }
  return {
    health: 'unavailable',
    severity: 'error',
    reason: 'feed-self-test-failed',
    detail: `Updater feed self-test failed: ${message || 'Unknown error'}`,
  };
}

function applyValidatedFeedFailure({ context, classification, metadataUrl, extra = {} }) {
  startupDiagnostics.setComponent('updater', classification.health, classification.detail);
  startupDiagnostics.pushEvent('updater', classification.severity, 'Updater feed validation failed.', {
    ...context,
    metadataUrl,
    classification: classification.reason,
    ...extra,
  });
  telemetryBus.publish(classification.health === 'degraded' ? 'startup.degraded' : 'startup.unavailable');
  emitDesktopHealth();
}

async function fetchValidatedFeedMetadata({ updater = null, phase = 'runtime-check' } = {}) {
  const publish = getUpdaterPublishConfig();
  const context = {
    ...buildUpdaterContext(updater),
    phase,
  };
  const metadataUrl = toFeedMetadataUrl(publish);
  if (!metadataUrl) {
    return {
      ok: false,
      context,
      metadataUrl,
      classification: {
        health: 'unavailable',
        severity: 'error',
        reason: 'feed-url-missing',
        detail: 'Updater feed URL is empty or invalid.',
      },
    };
  }

  try {
    const res = await fetch(metadataUrl, {
      cache: 'no-store',
      redirect: 'follow',
      headers: { Accept: 'application/octet-stream,text/yaml,text/plain,*/*' },
      signal: AbortSignal.timeout(UPDATER_FEED_SELF_TEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      return {
        ok: false,
        context,
        metadataUrl,
        classification: classifyFeedSelfTestFailure({
          statusCode: res.status,
          message: `HTTP ${res.status} ${res.statusText}`.trim(),
        }),
        extra: {
          statusCode: res.status,
          statusText: res.statusText,
        },
      };
    }

    const cacheControl = String(res.headers.get('cache-control') || '');
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    const raw = await res.text();
    const metadata = extractLatestFeedMetadata(raw);
    const structural = validateLatestFeedMetadata({ metadata, runtimeChannel: context.channel });
    if (!structural.ok) {
      return {
        ok: false,
        context,
        metadataUrl,
        classification: {
          health: 'unavailable',
          severity: 'error',
          reason: structural.reason,
          detail: structural.detail,
        },
        extra: {
          contentType,
        },
      };
    }

    if (!cacheControl || !/no-cache/i.test(cacheControl)) {
      return {
        ok: false,
        context,
        metadataUrl,
        classification: {
          health: 'unavailable',
          severity: 'error',
          reason: 'feed-cache-control-invalid',
          detail: `Updater metadata must return Cache-Control containing no-cache. Got '${cacheControl || '(missing)'}'.`,
        },
        extra: {
          cacheControl: cacheControl || null,
        },
      };
    }

    const publicKey = getUpdaterMetadataPublicKey();
    let signatureVerified = false;
    let signatureVerificationMode = publicKey ? 'verified' : 'disabled';
    if (publicKey) {
      const signatureUrl = toFeedSignatureUrl(publish);
      try {
        const signatureRes = await fetch(signatureUrl, {
          cache: 'no-store',
          redirect: 'follow',
          headers: { Accept: 'text/plain,application/octet-stream,*/*' },
          signal: AbortSignal.timeout(UPDATER_FEED_SELF_TEST_TIMEOUT_MS),
        });
        if (!signatureRes.ok) {
          return {
            ok: false,
            context,
            metadataUrl,
            classification: {
              health: 'unavailable',
              severity: 'error',
              reason: 'feed-signature-missing',
              detail: `Updater metadata signature is missing or unreachable (${signatureRes.status}).`,
            },
            extra: {
              signatureUrl,
              signatureStatusCode: signatureRes.status,
            },
          };
        }
        const signatureRaw = await signatureRes.text();
        const signatureValidation = verifyDetachedMetadataSignature({
          payload: raw,
          signature: signatureRaw,
          publicKey,
        });
        if (!signatureValidation.ok) {
          return {
            ok: false,
            context,
            metadataUrl,
            classification: {
              health: 'unavailable',
              severity: 'error',
              reason: 'feed-signature-invalid',
              detail: signatureValidation.detail,
            },
            extra: {
              signatureUrl,
            },
          };
        }
        signatureVerified = true;
        telemetryBus.publish('updater.metadata.signature-verified', { version: metadata.version });
      } catch (error) {
        return {
          ok: false,
          context,
          metadataUrl,
          classification: {
            health: 'unavailable',
            severity: 'error',
            reason: 'feed-signature-invalid',
            detail: `Updater metadata signature fetch/verify failed: ${error?.message || error}`,
          },
          extra: {
            signatureUrl,
          },
        };
      }
    }

    let rollout = null;
    if (metadata.stagingPercentage !== null) {
      const stableId = await getDeviceToken().catch(() => null);
      rollout = isUserWithinStagedRollout({
        stagingPercentage: metadata.stagingPercentage,
        stableId,
        version: metadata.version,
      });
    }

    _validatedFeedMetadata = {
      ...metadata,
      metadataUrl,
      signatureUrl: toFeedSignatureUrl(publish),
      cacheControl,
      contentType,
      signatureVerified,
      signatureVerificationMode,
      rollout,
    };
    return {
      ok: true,
      context,
      metadata: _validatedFeedMetadata,
      metadataUrl,
    };
  } catch (err) {
    return {
      ok: false,
      context,
      metadataUrl,
      classification: classifyFeedSelfTestFailure({
        message: String(err?.message || err || 'Unknown feed self-test error'),
        code: err?.code || err?.cause?.code || null,
      }),
      extra: {
        errorMessage: String(err?.message || err || 'Unknown feed self-test error'),
        errorCode: err?.code || err?.cause?.code || null,
      },
    };
  }
}

async function runUpdaterFeedSelfTest() {
  const publish = getUpdaterPublishConfig();
  const context = {
    ...buildUpdaterContext(null),
    phase: 'startup-self-test',
  };
  if (!app.isPackaged) {
    startupDiagnostics.pushEvent('updater', 'info', 'Updater feed self-test skipped in development mode.', context);
    logUpdaterEvent('feed-self-test:skipped-dev', context);
    return;
  }
  if (publish.provider !== 'generic') {
    const detail = `Updater provider is '${publish.provider}', expected 'generic'.`;
    startupDiagnostics.setComponent('updater', 'unavailable', detail);
    startupDiagnostics.pushEvent('updater', 'error', 'Updater feed self-test failed.', {
      ...context,
      classification: 'feed-provider-mismatch',
      detail,
    });
    telemetryBus.publish('startup.unavailable');
    emitDesktopHealth();
    logUpdaterEvent('feed-self-test:provider-mismatch', {
      ...context,
      expectedProvider: 'generic',
    });
    return;
  }

  const metadataUrl = toFeedMetadataUrl(publish);
  if (!metadataUrl) {
    const detail = 'Updater feed URL is empty or invalid.';
    startupDiagnostics.setComponent('updater', 'unavailable', detail);
    startupDiagnostics.pushEvent('updater', 'error', 'Updater feed self-test failed.', {
      ...context,
      classification: 'feed-url-missing',
      detail,
    });
    telemetryBus.publish('startup.unavailable');
    emitDesktopHealth();
    logUpdaterEvent('feed-self-test:url-missing', context);
    return;
  }

  startupDiagnostics.pushEvent('updater', 'info', 'Updater feed self-test started.', {
    ...context,
    metadataUrl,
  });
  logUpdaterEvent('feed-self-test:start', { ...context, metadataUrl });

  const validation = await fetchValidatedFeedMetadata({ updater: null, phase: 'startup-self-test' });
  if (!validation.ok) {
    applyValidatedFeedFailure({
      context,
      metadataUrl,
      classification: validation.classification,
      extra: validation.extra,
    });
    if (validation.classification.reason === 'feed-signature-invalid'
      || validation.classification.reason === 'feed-signature-missing') {
      telemetryBus.publish('updater.metadata.signature-failed', { metadataUrl });
    }
    logUpdaterEvent('feed-self-test:failed', {
      ...context,
      metadataUrl,
      classification: validation.classification.reason,
      ...(validation.extra || {}),
    });
    return;
  }

  const { metadata } = validation;
  const allowedContentType = !metadata.contentType
    || metadata.contentType.includes('yaml')
    || metadata.contentType.includes('text/plain')
    || metadata.contentType.includes('application/octet-stream');
  const signatureMissing = metadata.signatureVerificationMode === 'disabled';
  const health = allowedContentType && !signatureMissing ? 'healthy' : 'degraded';
  const detail = signatureMissing
    ? 'Updater feed self-test passed, but detached metadata signature verification is disabled for this build.'
    : allowedContentType
      ? 'Updater feed self-test passed.'
      : `Updater metadata loaded but returned unexpected content-type: ${metadata.contentType}`;
  startupDiagnostics.setComponent('updater', health, detail);
  startupDiagnostics.pushEvent('updater', health === 'healthy' ? 'info' : 'warn', 'Updater feed self-test passed.', {
    ...context,
    metadataUrl,
    contentType: metadata.contentType || null,
    cacheControl: metadata.cacheControl || null,
    latestVersion: metadata.version,
    metadataChannel: metadata.channel,
    minimumAllowedVersion: metadata.minimumAllowedVersion || null,
    stagingPercentage: metadata.stagingPercentage,
    signatureVerified: metadata.signatureVerified,
  });
  telemetryBus.publish(health === 'healthy' ? 'startup.healthy' : 'startup.degraded');
  emitDesktopHealth();
  logUpdaterEvent('feed-self-test:passed', {
    ...context,
    metadataUrl,
    contentType: metadata.contentType || null,
    cacheControl: metadata.cacheControl || null,
    health,
    latestVersion: metadata.version,
    metadataChannel: metadata.channel,
    minimumAllowedVersion: metadata.minimumAllowedVersion || null,
    stagingPercentage: metadata.stagingPercentage,
    signatureVerified: metadata.signatureVerified,
    rolloutEligible: metadata.rollout?.eligible ?? null,
  });
}

function shouldRetryFullInstallerDownload(errorMeta) {
  const lower = String(errorMeta?.message || '').toLowerCase();
  return /differential|blockmap|checksum|sha512|range|content-length|unexpected end|corrupt/.test(lower);
}

async function downloadUpdateWithFallback(updater, { version = null } = {}) {
  const context = buildUpdaterContext(updater);
  telemetryBus.publish('updater.download.started', { version: version || updateState.version || null });
  updater.disableDifferentialDownload = false;
  try {
    return await updater.downloadUpdate();
  } catch (error) {
    const errorMeta = toUpdaterErrorMetadata(error);
    if (!updater.disableDifferentialDownload && shouldRetryFullInstallerDownload(errorMeta)) {
      telemetryBus.publish('updater.download.full-fallback', { version: version || updateState.version || null });
      logUpdaterEvent('download:fallback-full-installer', {
        ...context,
        version: version || updateState.version || null,
        message: errorMeta.message,
      });
      emitUpdateStatus('downloading', 'Differential update failed — retrying full installer…', {
        downloaded: false,
        version: version || updateState.version || null,
        diagnostics: context,
      });
      updater.disableDifferentialDownload = true;
      try {
        return await updater.downloadUpdate();
      } finally {
        updater.disableDifferentialDownload = false;
      }
    }
    throw error;
  } finally {
    updater.disableDifferentialDownload = false;
  }
}

function getAutoUpdater() {
  if (_autoUpdater) return _autoUpdater;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false; // ask first, download on demand
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.allowDowngrade = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.disableWebInstaller = true;
    autoUpdater.isUserWithinRollout = async (updateInfo) => {
      const stagingPercentage = Number.isFinite(Number(updateInfo?.stagingPercentage))
        ? Number(updateInfo.stagingPercentage)
        : null;
      const rollout = isUserWithinStagedRollout({
        stagingPercentage,
        stableId: await getDeviceToken().catch(() => null),
        version: String(updateInfo?.version || app.getVersion()),
      });
      logUpdaterEvent('rollout:decision', {
        ...buildUpdaterContext(autoUpdater),
        version: String(updateInfo?.version || ''),
        stagingPercentage: rollout.percentage,
        bucket: rollout.bucket,
        eligible: rollout.eligible,
        reason: rollout.reason,
      });
      if (!rollout.eligible) {
        telemetryBus.publish('updater.rollout.deferred', {
          version: String(updateInfo?.version || ''),
          stagingPercentage: rollout.percentage,
        });
      }
      return rollout.eligible;
    };

    // Optional auth for GitHub provider only.
    const publish = getUpdaterPublishConfig();
    const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
    if (publish.provider === 'github' && ghToken) {
      autoUpdater.requestHeaders = { Authorization: `token ${ghToken}` };
    }

    startupDiagnostics.setComponent('updater', 'healthy', 'Updater initialized.');
    startupDiagnostics.pushEvent('updater', 'info', 'Updater initialized.', {
      ...buildUpdaterContext(autoUpdater),
      hasGithubToken: Boolean(ghToken),
    });
    logUpdaterEvent('init', {
      ...buildUpdaterContext(autoUpdater),
      hasGithubToken: Boolean(ghToken),
      autoDownload: autoUpdater.autoDownload,
      autoInstallOnAppQuit: autoUpdater.autoInstallOnAppQuit,
      allowDowngrade: autoUpdater.allowDowngrade,
      allowPrerelease: autoUpdater.allowPrerelease,
      disableWebInstaller: autoUpdater.disableWebInstaller,
    });
    telemetryBus.publish('startup.healthy');
    emitDesktopHealth();

    autoUpdater.on('checking-for-update', () => {
      const context = buildUpdaterContext(autoUpdater);
      logUpdaterEvent('checking-for-update', context);
      startupDiagnostics.pushEvent('updater', 'info', 'Checking for update.', context);
      emitUpdateStatus('checking', 'Checking for updates…', { downloaded: false, diagnostics: context });
    });

    autoUpdater.on('update-available', (info) => {
      const context = buildUpdaterContext(autoUpdater);
      const availableVersion = String(info?.version || '');
      if (_validatedFeedMetadata?.version && _validatedFeedMetadata.version !== availableVersion) {
        const detail = `Validated feed version (${_validatedFeedMetadata.version}) does not match updater runtime metadata (${availableVersion}).`;
        logUpdaterEvent('update-available:rejected', {
          ...context,
          availableVersion,
          expectedVersion: _validatedFeedMetadata.version,
          classification: 'feed-runtime-version-mismatch',
        });
        startupDiagnostics.setComponent('updater', 'unavailable', detail);
        startupDiagnostics.pushEvent('updater', 'error', 'Update metadata validation failed.', {
          ...context,
          availableVersion,
          expectedVersion: _validatedFeedMetadata.version,
          classification: 'feed-runtime-version-mismatch',
        });
        telemetryBus.publish('startup.unavailable');
        emitDesktopHealth();
        emitUpdateStatus('error', detail, {
          downloaded: false,
          reason: 'feed-runtime-version-mismatch',
          diagnostics: context,
        });
        return;
      }
      const sanity = classifyUpdateVersionSanity({
        availableVersion,
        currentVersion: context.appVersion,
        runtimeChannel: context.channel,
        metadataChannel: _validatedFeedMetadata?.channel || info?.channel || info?.releaseChannel || context.channel,
        minimumAllowedVersion: _validatedFeedMetadata?.minimumAllowedVersion || '',
      });
      if (!sanity.ok) {
        logUpdaterEvent('update-available:rejected', {
          ...context,
          availableVersion,
          classification: sanity.reason,
        });
        startupDiagnostics.setComponent('updater', 'unavailable', sanity.detail);
        startupDiagnostics.pushEvent('updater', 'error', 'Update metadata validation failed.', {
          ...context,
          availableVersion,
          classification: sanity.reason,
        });
        telemetryBus.publish('startup.unavailable');
        emitDesktopHealth();
        emitUpdateStatus('error', sanity.detail, {
          downloaded: false,
          reason: sanity.reason,
          diagnostics: context,
        });
        return;
      }
      logUpdaterEvent('update-available', {
        ...context,
        availableVersion,
      });
      telemetryBus.publish('updater.offered', {
        version: availableVersion,
        minimumAllowedVersion: _validatedFeedMetadata?.minimumAllowedVersion || null,
      });
      startupDiagnostics.setComponent('updater', 'healthy', `Update ${info.version} is available.`);
      startupDiagnostics.pushEvent('updater', 'info', 'Update available.', {
        ...context,
        availableVersion: String(info.version || ''),
      });
      emitDesktopHealth();
      emitUpdateStatus('update-available', `Update ${info.version} available.`, {
        downloaded: false,
        version: info.version,
        releaseNotes: String(info.releaseNotes || info.releaseName || ''),
        diagnostics: context,
      });
      const notes = String(info.releaseNotes || '').trim().slice(0, 1500);
      dialog.showMessageBox(win ?? null, {
        type: 'info',
        title: 'Jarvis Update Available',
        message: `Jarvis ${info.version} is ready to download.`,
        detail: notes ? `What's new:\n\n${notes}` : 'No release notes available for this build.',
        buttons: ['Download update', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }).then(({ response }) => {
        if (response === 0) {
          telemetryBus.publish('updater.accepted', { version: availableVersion });
          emitUpdateStatus('downloading', 'Downloading update…', { downloaded: false });
          downloadUpdateWithFallback(autoUpdater, { version: availableVersion }).catch((err) => {
            const errorMeta = toUpdaterErrorMetadata(err);
            console.warn('[updater] Download failed:', errorMeta.message);
            telemetryBus.publish('updater.download.failed', {
              version: availableVersion,
              message: errorMeta.message,
            });
            emitUpdateStatus('error', `Download failed: ${errorMeta.message}`, { downloaded: false });
          });
        } else {
          telemetryBus.publish('updater.deferred', { version: availableVersion });
          emitUpdateStatus('update-skipped', `Update to ${info.version} postponed.`, {
            downloaded: false,
            version: info.version,
          });
        }
      }).catch(() => {
        telemetryBus.publish('updater.deferred', { version: availableVersion });
        emitUpdateStatus('update-skipped', `Update to ${info.version} postponed.`, { downloaded: false });
      });
    });

    autoUpdater.on('update-not-available', () => {
      const context = buildUpdaterContext(autoUpdater);
      logUpdaterEvent('update-not-available', context);
      startupDiagnostics.setComponent('updater', 'healthy', 'No update available.');
      startupDiagnostics.pushEvent('updater', 'info', 'No update available.', context);
      telemetryBus.publish('startup.healthy');
      emitDesktopHealth();
      emitUpdateStatus('up-to-date', 'Jarvis is already up to date.', {
        downloaded: false,
        reason: 'up-to-date',
        diagnostics: context,
      });
    });

    autoUpdater.on('download-progress', (progress) => {
      const pct = Math.round(progress.percent || 0);
      logUpdaterEvent('download-progress', {
        ...buildUpdaterContext(autoUpdater),
        percent: pct,
        transferred: Number(progress.transferred || 0),
        total: Number(progress.total || 0),
      });
      emitUpdateStatus('downloading', `Downloading update… ${pct}%`, { downloaded: false });
    });

    autoUpdater.on('update-downloaded', (info) => {
      logUpdaterEvent('update-downloaded', {
        ...buildUpdaterContext(autoUpdater),
        downloadedVersion: String(info?.version || ''),
      });
      telemetryBus.publish('updater.downloaded', { version: String(info?.version || '') });
      emitUpdateStatus('ready-to-install', `Update ${info.version} downloaded — will install on next restart.`, {
        downloaded: true,
        version: info.version,
      });
    });

    autoUpdater.on('error', (err) => {
      const errorMeta = toUpdaterErrorMetadata(err);
      const context = buildUpdaterContext(autoUpdater);
      const classification = classifyUpdaterFailure(errorMeta, context);
      console.warn('[updater] autoUpdater error:', errorMeta.message);
      logUpdaterEvent('error', {
        ...context,
        ...errorMeta,
        classification: classification.reason,
      });
      startupDiagnostics.setComponent('updater', classification.health, classification.detail);
      startupDiagnostics.pushEvent('updater', classification.severity, 'Updater emitted error event.', {
        ...context,
        ...errorMeta,
        classification: classification.reason,
      });
      if (classification.reason === 'feed-signature-invalid' || classification.reason === 'signature-validation-failed') {
        telemetryBus.publish('updater.metadata.signature-failed', {
          version: _validatedFeedMetadata?.version || null,
          message: errorMeta.message,
        });
      }
      if (classification.reason === 'installer-execution-failed'
        || classification.reason === 'installer-lock-detected'
        || classification.reason === 'installer-blocked-by-security-software') {
        telemetryBus.publish('updater.install.failed', {
          version: updateState.version || _validatedFeedMetadata?.version || null,
          exitCode: errorMeta.installerExitCode,
          reason: classification.reason,
        });
      }
      telemetryBus.publish(classification.health === 'degraded' ? 'startup.degraded' : classification.health === 'healthy' ? 'startup.healthy' : 'startup.unavailable');
      emitDesktopHealth();
      emitUpdateStatus(classification.status, classification.detail, {
        downloaded: false,
        reason: classification.reason,
        diagnostics: context,
      });
    });

    _autoUpdater = autoUpdater;
    return autoUpdater;
  } catch (err) {
    console.warn('[updater] electron-updater not available:', err.message);
    startupDiagnostics.setComponent('updater', 'unavailable', `Updater unavailable: ${err.message}`);
    startupDiagnostics.pushEvent('updater', 'warn', 'Updater module unavailable.', { message: err.message });
    telemetryBus.publish('startup.unavailable');
    emitDesktopHealth();
    return null;
  }
}

function checkForUpdates() {
  if (!app.isPackaged) {
    logUpdaterEvent('check-for-updates:skipped-dev', buildUpdaterContext(null));
    startupDiagnostics.setComponent('updater', 'degraded', 'Updater disabled in development mode.');
    startupDiagnostics.pushEvent('updater', 'info', 'Update check skipped in development mode.');
    telemetryBus.publish('startup.degraded');
    emitDesktopHealth();
    emitUpdateStatus('disabled', 'Running in dev mode. Install the EXE build to enable auto-updates.');
    return Promise.resolve({ ok: false, reason: 'not-packaged' });
  }
  const updater = getAutoUpdater();
  if (!updater) {
    return Promise.resolve({ ok: false, reason: 'updater-unavailable' });
  }
  const context = buildUpdaterContext(updater);
  logUpdaterEvent('check-for-updates:requested', context);
  startupDiagnostics.pushEvent('updater', 'info', 'Manual update check requested.', context);
  return fetchValidatedFeedMetadata({ updater, phase: 'manual-check' })
    .then((validation) => {
      if (!validation.ok) {
        applyValidatedFeedFailure({
          context,
          metadataUrl: validation.metadataUrl,
          classification: validation.classification,
          extra: validation.extra,
        });
        if (validation.classification.reason === 'feed-signature-invalid'
          || validation.classification.reason === 'feed-signature-missing') {
          telemetryBus.publish('updater.metadata.signature-failed', { metadataUrl: validation.metadataUrl });
        }
        emitUpdateStatus('error', validation.classification.detail, {
          downloaded: false,
          reason: validation.classification.reason,
          diagnostics: context,
        });
        return { ok: false, reason: validation.classification.reason };
      }

      const { metadata } = validation;
      const preflight = classifyUpdateVersionSanity({
        availableVersion: metadata.version,
        currentVersion: context.appVersion,
        runtimeChannel: context.channel,
        metadataChannel: metadata.channel,
        minimumAllowedVersion: metadata.minimumAllowedVersion || '',
      });
      if (!preflight.ok) {
        const healthyNoUpdate = preflight.reason === 'feed-version-not-newer';
        startupDiagnostics.setComponent('updater', healthyNoUpdate ? 'healthy' : 'unavailable', preflight.detail);
        startupDiagnostics.pushEvent('updater', healthyNoUpdate ? 'info' : 'error', healthyNoUpdate ? 'No update available after feed validation.' : 'Updater feed validation rejected metadata.', {
          ...context,
          classification: preflight.reason,
          availableVersion: metadata.version,
          minimumAllowedVersion: metadata.minimumAllowedVersion || null,
        });
        telemetryBus.publish(healthyNoUpdate ? 'startup.healthy' : 'startup.unavailable');
        emitDesktopHealth();
        emitUpdateStatus(healthyNoUpdate ? 'up-to-date' : 'error', healthyNoUpdate ? 'Jarvis is already up to date.' : preflight.detail, {
          downloaded: false,
          reason: preflight.reason,
          diagnostics: context,
        });
        return { ok: healthyNoUpdate, reason: preflight.reason };
      }

      if (metadata.rollout && !metadata.rollout.eligible) {
        telemetryBus.publish('updater.rollout.deferred', {
          version: metadata.version,
          stagingPercentage: metadata.stagingPercentage,
        });
        startupDiagnostics.setComponent('updater', 'healthy', `Update ${metadata.version} is staged and not yet assigned to this device.`);
        startupDiagnostics.pushEvent('updater', 'info', 'Update deferred by staged rollout policy.', {
          ...context,
          availableVersion: metadata.version,
          stagingPercentage: metadata.stagingPercentage,
          rolloutBucket: metadata.rollout.bucket,
          classification: metadata.rollout.reason,
        });
        telemetryBus.publish('startup.healthy');
        emitDesktopHealth();
        emitUpdateStatus('up-to-date', `Update ${metadata.version} is being rolled out gradually and is not available on this device yet.`, {
          downloaded: false,
          reason: metadata.rollout.reason,
          version: metadata.version,
          diagnostics: context,
        });
        return { ok: false, reason: metadata.rollout.reason };
      }

      return updater.checkForUpdates()
        .then(() => ({ ok: true }))
        .catch((err) => {
          const errorMeta = toUpdaterErrorMetadata(err);
          const classification = classifyUpdaterFailure(errorMeta, context);
          console.warn('[updater] checkForUpdates failed:', errorMeta.message);
          logUpdaterEvent('check-for-updates:failed', {
            ...context,
            ...errorMeta,
            classification: classification.reason,
          });
          startupDiagnostics.setComponent('updater', classification.health, `Check for updates failed: ${classification.detail}`);
          startupDiagnostics.pushEvent('updater', classification.severity, 'checkForUpdates failed.', {
            ...context,
            ...errorMeta,
            classification: classification.reason,
          });
          telemetryBus.publish(classification.health === 'degraded' ? 'startup.degraded' : classification.health === 'healthy' ? 'startup.healthy' : 'startup.unavailable');
          emitDesktopHealth();
          emitUpdateStatus(classification.status, classification.detail, {
            downloaded: false,
            reason: classification.reason,
            diagnostics: context,
          });
          return { ok: false, reason: classification.reason };
        });
    })
    .catch((err) => {
      const errorMeta = toUpdaterErrorMetadata(err);
      const classification = classifyUpdaterFailure(errorMeta, context);
      console.warn('[updater] checkForUpdates threw:', errorMeta.message);
      logUpdaterEvent('check-for-updates:threw', {
        ...context,
        ...errorMeta,
        classification: classification.reason,
      });
      startupDiagnostics.setComponent('updater', classification.health, `Update check threw: ${classification.detail}`);
      startupDiagnostics.pushEvent('updater', classification.severity, 'checkForUpdates threw.', {
        ...context,
        ...errorMeta,
        classification: classification.reason,
      });
      telemetryBus.publish('startup.unavailable');
      emitDesktopHealth();
      emitUpdateStatus(classification.status, classification.detail, {
        downloaded: false,
        reason: classification.reason,
        diagnostics: context,
      });
      return { ok: false, reason: classification.reason };
    });
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    logUpdaterEvent('setup:skipped-dev', buildUpdaterContext(null));
    startupDiagnostics.setComponent('updater', 'degraded', 'Updater disabled in development mode.');
    startupDiagnostics.pushEvent('updater', 'info', 'Updater setup skipped in development mode.');
    telemetryBus.publish('startup.degraded');
    emitDesktopHealth();
    emitUpdateStatus('disabled', 'Running in dev mode. Install the EXE build to enable auto-updates.');
    return;
  }
  void runUpdaterFeedSelfTest();
  getAutoUpdater(); // wire up event listeners
  setTimeout(() => {
    void checkForUpdates();
  }, 15000);
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
    { label: 'Check for updates', click: () => void checkForUpdates() },
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
  downloadUpdateWithFallback,
  getJarvisWebUrl,
  setJarvisWebUrl,
  getAutoUpdater,
  updateState,
  emitUpdateStatus,
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
  const startupProtocolUrl = extractProtocolUrl(process.argv);
  if (startupProtocolUrl) {
    void handleProtocolCallback(startupProtocolUrl, 'startup-argv');
  }
  // Initialise the SQLite database (sql.js loads its WASM binary asynchronously)
  // before any launcher or IPC code touches it.
  try {
    await require('./launcher/db').init();
    startupDiagnostics.setComponent('db', 'healthy', 'Launcher DB initialized.');
    startupDiagnostics.pushEvent('startup', 'info', 'Launcher DB initialization completed.');
    telemetryBus.publish('startup.healthy');
  } catch (err) {
    console.error('[db] Failed to initialise database:', err.message);
    startupDiagnostics.setComponent('db', 'unavailable', `Launcher DB init failed: ${err.message}`);
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
  launcherService.refreshCatalog({ reason: 'app-ready' })
    .then(() => {
      startupDiagnostics.setComponent('launcher', 'healthy', 'Launcher catalog refreshed.');
      startupDiagnostics.pushEvent('launcher', 'info', 'Launcher catalog refresh completed.');
      telemetryBus.publish('startup.healthy');
      emitDesktopHealth();
      return maybePromptEverythingRecommendation();
    })
    .catch((error) => {
      console.warn('[launcher] startup refresh failed:', error.message);
      startupDiagnostics.setComponent('launcher', 'degraded', `Launcher refresh failed: ${error.message}`);
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
  void checkForUpdates();
});
