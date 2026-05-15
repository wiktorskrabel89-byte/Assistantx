const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const { getJarvisWebUrl, setJarvisWebUrl } = require('./runtime-config');
const { decodeJwtPayload } = require('./accounts');
const { spawn } = require('child_process');
const launcherService = require('./launcher/launch-service');
const launcherDb = require('./launcher/db');
const { createStartupDiagnostics } = require('./services/startup-diagnostics');
const { invalidResult, parseHttpUrl, validateInteger, validatePlainObject, validateString } = require('./services/ipc-guards');
const { createEventBus } = require('./telemetry/event-bus');
const { getLocalTelemetrySnapshot, wireLocalTelemetry } = require('./telemetry/local-telemetry');

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
let updateState = {
  status: 'idle',
  detail: 'Waiting to check for updates.',
  downloaded: false,
  downloadUrl: null,
};

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

// ── electron-updater integration ─────────────────────────────────────────────
// autoUpdater reads publish config from package.json (generic/public feed in
// production) and handles detection, download, and install.
let _autoUpdater = null;
let _updaterPublishConfig = null;

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
    githubOwner: publish.owner || null,
    githubRepo: publish.repo || null,
    githubReleaseType: publish.releaseType || null,
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
  return {
    message,
    code,
    statusCode,
    isNetwork: /network|fetch|econnrefused|enotfound|ehostunreach|timeout|eai_again|socket hang up|etimedout/.test(lower),
    isAuth: /401|403|unauthorized|forbidden|bad credentials|token|authentication/.test(lower) || statusCode === 401 || statusCode === 403,
    isNoRelease: /no published versions? on github|no published releases? on github/.test(lower),
    isMetadataIssue: /latest\.yml|yaml|cannot parse|invalid update info|blockmap|sha512|checksum/.test(lower),
  };
}

function classifyUpdaterFailure(errorMeta, updaterContext) {
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

function getAutoUpdater() {
  if (_autoUpdater) return _autoUpdater;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false; // ask first, download on demand
    autoUpdater.autoInstallOnAppQuit = true;

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
    telemetryBus.publish('startup.healthy');
    emitDesktopHealth();

    autoUpdater.on('checking-for-update', () => {
      const context = buildUpdaterContext(autoUpdater);
      startupDiagnostics.pushEvent('updater', 'info', 'Checking for update.', context);
      emitUpdateStatus('checking', 'Checking for updates…', { downloaded: false, diagnostics: context });
    });

    autoUpdater.on('update-available', (info) => {
      const context = buildUpdaterContext(autoUpdater);
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
          emitUpdateStatus('downloading', 'Downloading update…', { downloaded: false });
          autoUpdater.downloadUpdate().catch((err) => {
            console.warn('[updater] Download failed:', err.message);
            emitUpdateStatus('error', `Download failed: ${err.message}`, { downloaded: false });
          });
        } else {
          emitUpdateStatus('update-skipped', `Update to ${info.version} postponed.`, {
            downloaded: false,
            version: info.version,
          });
        }
      }).catch(() => {
        emitUpdateStatus('update-skipped', `Update to ${info.version} postponed.`, { downloaded: false });
      });
    });

    autoUpdater.on('update-not-available', () => {
      const context = buildUpdaterContext(autoUpdater);
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
      emitUpdateStatus('downloading', `Downloading update… ${pct}%`, { downloaded: false });
    });

    autoUpdater.on('update-downloaded', (info) => {
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
      startupDiagnostics.setComponent('updater', classification.health, classification.detail);
      startupDiagnostics.pushEvent('updater', classification.severity, 'Updater emitted error event.', {
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
  try {
    const context = buildUpdaterContext(updater);
    startupDiagnostics.pushEvent('updater', 'info', 'Manual update check requested.', context);
    updater.checkForUpdates().catch((err) => {
      const errorMeta = toUpdaterErrorMetadata(err);
      const classification = classifyUpdaterFailure(errorMeta, context);
      console.warn('[updater] checkForUpdates failed:', errorMeta.message);
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
    });
    return Promise.resolve({ ok: true });
  } catch (err) {
    const errorMeta = toUpdaterErrorMetadata(err);
    const context = buildUpdaterContext(updater);
    const classification = classifyUpdaterFailure(errorMeta, context);
    console.warn('[updater] checkForUpdates threw:', errorMeta.message);
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
    return Promise.resolve({ ok: false, reason: errorMeta.message });
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    startupDiagnostics.setComponent('updater', 'degraded', 'Updater disabled in development mode.');
    startupDiagnostics.pushEvent('updater', 'info', 'Updater setup skipped in development mode.');
    telemetryBus.publish('startup.degraded');
    emitDesktopHealth();
    emitUpdateStatus('disabled', 'Running in dev mode. Install the EXE build to enable auto-updates.');
    return;
  }
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('index.html');

  win.webContents.on('did-finish-load', () => {
    sendToRenderer('app-meta', {
      version: app.getVersion(),
      packaged: app.isPackaged,
    });
    sendToRenderer('auto-update-status', updateState);
    sendToRenderer('desktop-health', startupDiagnostics.snapshot());
  });

  win.on('close', (event) => {
    if (!app.isQuitting) {
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
      preload: path.join(__dirname, 'launcher-preload.js'),
    },
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
    if (!app.isQuitting) {
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

ipcMain.handle('get-sidecar-status', () => ({
  status: sidecarStatus,
  port: Number(SIDECAR_PORT),
}));

ipcMain.handle('restart-sidecar', () => {
  stopSidecar();
  telemetryBus.publish('sidecar.restart');
  setTimeout(() => startSidecar(), 500);
  return { ok: true };
});

ipcMain.handle('open-url', (_event, url) => {
  const parsed = parseHttpUrl(url);
  if (!parsed) return invalidResult('open-url', 'url-must-be-http-or-https');
  return shell.openExternal(parsed.toString()).then(() => ({ ok: true }));
});

ipcMain.handle('open-path', (_event, filePath) => {
  const normalizedPath = validateString(filePath, { maxLen: 8192 });
  if (!normalizedPath) return invalidResult('open-path', 'path-must-be-non-empty-string');
  return shell.openPath(normalizedPath).then((result) => ({
    ok: !result,
    error: result || null,
  }));
});

ipcMain.handle('launcher-search', async (_event, payload) => {
  await ensureDbReady();
  const body = validatePlainObject(payload) || {};
  const query = validateString(body.query, { allowEmpty: true, maxLen: 200 }) || '';
  const limit = validateInteger(body.limit, { min: 1, max: 20, fallback: 8 });
  return launcherService.searchApps(query, { limit });
});

ipcMain.handle('launcher-recent', async (_event, payload) => {
  await ensureDbReady();
  const body = validatePlainObject(payload) || {};
  const limit = validateInteger(body.limit, { min: 1, max: 20, fallback: 8 });
  return launcherService.searchApps('', { limit });
});

ipcMain.handle('launcher-refresh', async () => {
  await ensureDbReady();
  const result = await launcherService.refreshCatalog({ reason: 'overlay-manual' });
  void maybePromptEverythingRecommendation();
  return result;
});

ipcMain.handle('launcher-launch', async (_event, payload) => {
  await ensureDbReady();
  const body = validatePlainObject(payload);
  if (!body) return invalidResult('launcher-launch', 'payload-must-be-object');
  const query = validateString(body.query, { allowEmpty: true, maxLen: 200 }) || '';
  const key = validateString(body.key, { allowEmpty: true, maxLen: 200 }) || '';
  const launchQuery = query || key;
  if (!launchQuery) return invalidResult('launcher-launch', 'query-or-key-required');
  return launcherService.launchApp(launchQuery, {
    trigger: 'manual',
    confirmed: true,
    admin: Boolean(body.admin),
  });
});

ipcMain.handle('launcher-hide', () => {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
  return { ok: true };
});

ipcMain.handle('request-launcher-confirmation', async (_event, payload) => {
  const body = validatePlainObject(payload) || {};
  const title = validateString(body.title, { allowEmpty: true, maxLen: 120 }) || 'Confirm launch';
  const message = validateString(body.message, { allowEmpty: true, maxLen: 500 }) || 'Do you want to continue?';
  if (!overlayWin || overlayWin.isDestroyed()) createLauncherOverlayWindow();
  const id = `launcher-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  overlayWin.show();
  overlayWin.focus();
  overlayWin.webContents.send('launcher-confirmation-request', {
    id,
    ...body,
    title,
    message,
  });
  return new Promise((resolve) => {
    pendingLauncherConfirmations.set(id, resolve);
  });
});

ipcMain.handle('launcher-confirmation-response', (_event, payload) => {
  const body = validatePlainObject(payload);
  if (!body) return invalidResult('launcher-confirmation-response', 'payload-must-be-object');
  const confirmationId = validateString(body.id, { maxLen: 120 });
  if (!confirmationId) return invalidResult('launcher-confirmation-response', 'id-required');
  const pending = pendingLauncherConfirmations.get(confirmationId);
  if (pending) {
    pending(Boolean(body.approved));
    pendingLauncherConfirmations.delete(confirmationId);
  }
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('launcher-confirmation-cleared', { id: confirmationId || null });
    if (pendingLauncherConfirmations.size === 0) {
      overlayWin.webContents.send('launcher-overlay-focus');
    }
  }
  return { ok: true };
});

ipcMain.handle('install-everything-search', async () => {
  launcherService.remindLaterForEverything();
  await shell.openExternal('https://www.voidtools.com/downloads/');
  return { ok: true };
});

ipcMain.handle('jarvis-ai-request', async (_event, payload) => {
  const body = validatePlainObject(payload);
  if (!body) {
    return { ok: false, status: 400, body: 'Invalid payload', headers: { 'content-type': 'text/plain' } };
  }
  const endpoint = validateString(body.endpoint, { maxLen: 2000 });
  const endpointUrl = parseHttpUrl(endpoint);
  if (!endpointUrl) {
    return { ok: false, status: 400, body: 'Invalid endpoint', headers: { 'content-type': 'text/plain' } };
  }

  const timeoutMs = validateInteger(body.timeoutMs, { min: 1_000, max: 120_000, fallback: 45_000 });
  try {
    const requestHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': `JarvisDesktop/${app.getVersion()} Electron`,
      'Origin': endpointUrl.origin,
    };
    const token = validateString(body.token, { allowEmpty: true, maxLen: 5000 });
    if (token) {
      requestHeaders['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(validatePlainObject(body.payload) || {}),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const body = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      body,
      headers: {
        'content-type': response.headers.get('content-type') || 'text/plain',
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      body: `Main-process AI proxy failed: ${error?.message || 'unknown error'}`,
      headers: {
        'content-type': 'text/plain',
      },
    };
  }
});

ipcMain.handle('get-desktop-diagnostics', () => startupDiagnostics.snapshot());

ipcMain.handle('get-local-telemetry', () => getLocalTelemetrySnapshot());

ipcMain.handle('get-app-meta', () => {
  return {
    version: app.getVersion(),
    packaged: app.isPackaged,
  };
});

ipcMain.handle('get-displays', () => {
  const { screen } = require('electron');
  return screen.getAllDisplays().map((display) => ({
    id: display.id,
    label: display.label || `Display ${display.id}`,
    bounds: display.bounds,
    scaleFactor: display.scaleFactor,
    isPrimary: display.bounds.x === 0 && display.bounds.y === 0,
  }));
});

ipcMain.handle('check-for-updates', () => {
  return checkForUpdates();
});

ipcMain.handle('get-jarvis-web-url', () => getJarvisWebUrl());

ipcMain.handle('set-jarvis-web-url', (_event, url) => {
  const urlStr = validateString(url, { allowEmpty: true, maxLen: 300 }) || '';
  if (urlStr && !parseHttpUrl(urlStr)) {
    return invalidResult('set-jarvis-web-url', 'server-url-must-be-http-or-https');
  }
  setJarvisWebUrl(urlStr || null);
  return { ok: true, url: getJarvisWebUrl() };
});

ipcMain.handle('download-update', async () => {
  if (!app.isPackaged) {
    return { ok: false, reason: 'not-packaged' };
  }
  const updater = getAutoUpdater();
  if (!updater) {
    return { ok: false, reason: 'updater-unavailable' };
  }
  try {
    emitUpdateStatus('downloading', 'Downloading update…', { downloaded: false });
    await updater.downloadUpdate();
    startupDiagnostics.setComponent('updater', 'healthy', 'Update downloaded successfully.');
    startupDiagnostics.pushEvent('updater', 'info', 'Update download completed.');
    telemetryBus.publish('startup.healthy');
    emitDesktopHealth();
    return { ok: true };
  } catch (error) {
    console.warn('[updater] Download failed:', error.message);
    startupDiagnostics.setComponent('updater', 'degraded', `Update download failed: ${error.message}`);
    startupDiagnostics.pushEvent('updater', 'warn', 'Update download failed.', { message: error.message });
    telemetryBus.publish('startup.degraded');
    emitDesktopHealth();
    emitUpdateStatus('error', `Download failed: ${error.message}`, { downloaded: false });
    return { ok: false, reason: error.message };
  }
});

ipcMain.handle('install-update', () => {
  if (!app.isPackaged) return { ok: false, reason: 'not-packaged' };
  const updater = getAutoUpdater();
  if (!updater || !updateState.downloaded) {
    return { ok: false, reason: 'no-update-downloaded' };
  }
  updater.quitAndInstall();
  return { ok: true };
});

// ── Account login via browser window ─────────────────────────────────────────
// Opens the AssistantX web login page in a child BrowserWindow, waits for the
// OAuth callback URL to contain a session token, then closes the window and
// returns the session to the renderer.
ipcMain.handle('open-account-login', async () => {
  const webUrl = getJarvisWebBaseUrl();
  const loginUrl = `${webUrl}/auth/login?client=jarvis-desktop`;

  // Callback URLs are best-effort event detection; closing the window without
  // a token should resolve null rather than reject to keep renderer flow stable.
  return new Promise((resolve) => {
    const loginWin = new BrowserWindow({
      width: 480,
      height: 680,
      title: 'Sign in to AssistantX',
      parent: win || undefined,
      modal: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    loginWin.loadURL(loginUrl);

    let settled = false;
    const finalizeResolve = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    const inspectUrl = (url) => {
      parseCallbackUrl(url, loginWin, finalizeResolve);
    };

    // Detect callback URL carrying the session token
    loginWin.webContents.on('will-redirect', (_event, url) => {
      inspectUrl(url);
    });
    loginWin.webContents.on('did-redirect-navigation', (_event, url) => {
      inspectUrl(url);
    });
    loginWin.webContents.on('did-navigate', (_event, url) => {
      inspectUrl(url);
    });
    loginWin.webContents.on('did-navigate-in-page', (_event, url) => {
      inspectUrl(url);
    });
    loginWin.webContents.on('did-finish-load', () => {
      try {
        inspectUrl(loginWin.webContents.getURL());
      } catch {
        // ignore transient navigation state errors
      }
    });

    loginWin.on('closed', () => finalizeResolve(null));
  });
});

function parseCallbackUrl(url, loginWin, resolve) {
  try {
    const parsed = new URL(url);
    const hashParams = new URLSearchParams(parsed.hash.slice(1));
    const accessToken = hashParams.get('access_token') || parsed.searchParams.get('access_token');

    if (!accessToken) return; // not a callback URL, keep watching

    const jwtPayload = decodeJwtPayload(accessToken);
    const email = hashParams.get('email') || parsed.searchParams.get('email')
      || jwtPayload?.email || '';
    const userId = hashParams.get('sub') || hashParams.get('user_id') || parsed.searchParams.get('user_id')
      || jwtPayload?.sub || '';
    const refreshToken = hashParams.get('refresh_token') || parsed.searchParams.get('refresh_token') || '';
    loginWin.close();
    resolve({ accessToken, refreshToken, email, userId, signedInAt: new Date().toISOString() });
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[auth] Ignoring non-callback navigation URL during login handoff.');
    }
  }
}

app.whenReady().then(async () => {
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
