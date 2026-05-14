const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const { getJarvisWebUrl, setJarvisWebUrl } = require('./runtime-config');
const { spawn } = require('child_process');
const launcherService = require('./launcher/launch-service');

// ── Python AI-Agent sidecar process management ───────────────────────────────
let sidecarProcess = null;
let sidecarStatus = 'idle';
const SIDECAR_PORT = process.env.JARVIS_SIDECAR_PORT || '8765';

function getSidecarMainPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ai-agent', 'main.py');
  }
  return path.join(__dirname, '..', '..', 'ai-agent', 'main.py');
}

function getPythonExecutable() {
  const sidecarDir = path.dirname(getSidecarMainPath());
  const candidates = [
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
    return;
  }

  const python = getPythonExecutable();
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
    if (line.includes('listening on')) sidecarStatus = 'running';
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.stderr?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[sidecar:err] ${line}`);
    if (line.includes('listening on')) sidecarStatus = 'running';
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.on('exit', (code, signal) => {
    console.log(`[sidecar] process exited: code=${code} signal=${signal}`);
    sidecarProcess = null;
    sidecarStatus = 'stopped';
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.on('error', (err) => {
    console.error('[sidecar] spawn error:', err.message);
    sidecarStatus = 'error';
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

function getJarvisDownloadUrl() {
  const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
  return `${getJarvisWebBaseUrl()}/api/jarvis/download?platform=windows&arch=${arch}`;
}

// ── electron-updater integration ─────────────────────────────────────────────
// autoUpdater reads the publish config from package.json (GitHub provider,
// wiktorskrabel89-byte/Assistantx) and handles detection, download, and install.
let _autoUpdater = null;

function getAutoUpdater() {
  if (_autoUpdater) return _autoUpdater;
  try {
    const { autoUpdater } = require('electron-updater');
    autoUpdater.autoDownload = false; // ask first, download on demand
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => {
      emitUpdateStatus('checking', 'Checking for updates…', { downloaded: false });
    });

    autoUpdater.on('update-available', (info) => {
      emitUpdateStatus('update-available', `Update ${info.version} available.`, {
        downloaded: false,
        version: info.version,
        releaseNotes: String(info.releaseNotes || info.releaseName || ''),
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
      emitUpdateStatus('up-to-date', 'Jarvis is already up to date.', { downloaded: false });
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
      const msg = err?.message || String(err);
      console.warn('[updater] autoUpdater error:', msg);
      // Treat network/endpoint failures as transient rather than hard errors.
      const isTransient = /network|fetch|econnrefused|enotfound|ehostunreach|timeout/i.test(msg);
      emitUpdateStatus(
        isTransient ? 'unavailable' : 'error',
        isTransient ? 'Update check is temporarily unavailable (network).' : `Update error: ${msg}`,
        { downloaded: false },
      );
    });

    _autoUpdater = autoUpdater;
    return autoUpdater;
  } catch (err) {
    console.warn('[updater] electron-updater not available:', err.message);
    return null;
  }
}

function checkForUpdates() {
  if (!app.isPackaged) {
    emitUpdateStatus('disabled', 'Running in dev mode. Install the EXE build to enable auto-updates.');
    return Promise.resolve({ ok: false, reason: 'not-packaged' });
  }
  const updater = getAutoUpdater();
  if (!updater) {
    return Promise.resolve({ ok: false, reason: 'updater-unavailable' });
  }
  try {
    updater.checkForUpdates().catch((err) => {
      console.warn('[updater] checkForUpdates failed:', err.message);
    });
    return Promise.resolve({ ok: true });
  } catch (err) {
    console.warn('[updater] checkForUpdates threw:', err.message);
    return Promise.resolve({ ok: false, reason: err.message });
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    emitUpdateStatus('disabled', 'Running in dev mode. Install the EXE build to enable auto-updates.');
    return;
  }
  getAutoUpdater(); // wire up event listeners
  setTimeout(() => {
    void checkForUpdates();
  }, 4000);
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
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  win.loadFile('index.html');

  win.webContents.on('did-finish-load', () => {
    sendToRenderer('app-meta', {
      version: app.getVersion(),
      packaged: app.isPackaged,
    });
    sendToRenderer('auto-update-status', updateState);
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
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  overlayWin.loadFile('launcher-overlay.html');
  overlayWin.webContents.on('did-finish-load', () => {
    overlayWin.webContents.send('sidecar-status', { status: sidecarStatus });
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
  const [recent, providerStatus] = await Promise.all([
    Promise.resolve(launcherService.getRecentApps(8)),
    Promise.resolve(launcherService.getProviderStatus()),
  ]);
  overlayWin.show();
  overlayWin.focus();
  overlayWin.webContents.send('launcher-overlay-focus', { recent, providerStatus });
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

async function checkForUpdates() {
  if (!app.isPackaged) {
    emitUpdateStatus('disabled', 'Running in dev mode. Install the EXE build to enable auto-updates.');
    return { ok: false, reason: 'not-packaged' };
  }

  const now = Date.now();
  if (now - lastUpdateCheckAt < UPDATE_CHECK_DEBOUNCE_MS) {
    return { ok: true, reason: 'debounced' };
  }
  lastUpdateCheckAt = now;

  try {
    emitUpdateStatus('checking', 'Checking Jarvis release endpoint for a newer build...', { downloaded: false });
    const release = await fetchLatestJarvisRelease();

    if (!release || compareVersions(release.version, app.getVersion()) <= 0) {
      emitUpdateStatus('up-to-date', 'Jarvis is already up to date.', {
        downloaded: false,
        downloadUrl: null,
      });
      return { ok: true, reason: 'up-to-date' };
    }

    emitUpdateStatus('update-available', `Update ${release.version} available.`, {
      downloaded: false,
      version: release.version,
      downloadUrl: release.downloadUrl,
    });

    const notes = String(release.releaseNotes || '').trim().slice(0, 1500);

    let response = 1;
    try {
      ({ response } = await dialog.showMessageBox(win ?? null, {
        type: 'info',
        title: 'Jarvis Update Available',
        message: `Jarvis ${release.version} is ready to download.`,
        detail: notes
          ? `What's new:\n\n${notes}`
          : 'No release notes available for this build.',
        buttons: ['Download update', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }));
    } catch {
      response = 1;
    }

    if (response === 0) {
      await openUpdateDownload();
      return { ok: true, reason: 'download-opened' };
    }

    emitUpdateStatus('update-skipped', `Update to ${release.version} postponed.`, {
      downloaded: false,
      version: release.version,
      downloadUrl: release.downloadUrl,
    });
    return { ok: true, reason: 'skipped' };
  } catch (error) {
    if (isTransientFetchFailure(error) || isReleaseUnavailableError(error)) {
      emitUpdateStatus('unavailable', 'Update check is temporarily unavailable (network or release endpoint).', { downloaded: false });
      return { ok: false, reason: 'update-check-unavailable' };
    }
    emitUpdateStatus('error', `Update check failed: ${error.message}`, { downloaded: false });
    return { ok: false, reason: error.message };
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    emitUpdateStatus('disabled', 'Running in dev mode. Install the EXE build to enable auto-updates.');
    return;
  }

  setTimeout(() => {
    void checkForUpdates();
  }, 4000);

  if (updateInterval) clearInterval(updateInterval);
  updateInterval = setInterval(() => {
    void checkForUpdates();
  }, UPDATE_CHECK_INTERVAL_MS);
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
  setTimeout(() => startSidecar(), 500);
  return { ok: true };
});

ipcMain.handle('open-url', (_event, url) => {
  if (typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'))) {
    return shell.openExternal(url);
  }
  return Promise.reject(new Error('Invalid URL'));
});

ipcMain.handle('open-path', (_event, filePath) => {
  return shell.openPath(filePath);
});

ipcMain.handle('launcher-search', async (_event, payload) => {
  return launcherService.searchApps(payload?.query || '', { limit: Number(payload?.limit || 8) });
});

ipcMain.handle('launcher-recent', async (_event, payload) => {
  return launcherService.searchApps('', { limit: Number(payload?.limit || 8) });
});

ipcMain.handle('launcher-refresh', async () => {
  const result = await launcherService.refreshCatalog({ reason: 'overlay-manual' });
  void maybePromptEverythingRecommendation();
  return result;
});

ipcMain.handle('launcher-launch', async (_event, payload) => {
  return launcherService.launchApp(payload?.query || payload?.key || '', {
    trigger: 'manual',
    confirmed: true,
    admin: Boolean(payload?.admin),
  });
});

ipcMain.handle('launcher-hide', () => {
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.hide();
  return { ok: true };
});

ipcMain.handle('request-launcher-confirmation', async (_event, payload) => {
  if (!overlayWin || overlayWin.isDestroyed()) createLauncherOverlayWindow();
  const id = `launcher-confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  overlayWin.show();
  overlayWin.focus();
  overlayWin.webContents.send('launcher-confirmation-request', {
    id,
    ...payload,
  });
  return new Promise((resolve) => {
    pendingLauncherConfirmations.set(id, resolve);
  });
});

ipcMain.handle('launcher-confirmation-response', (_event, payload) => {
  const pending = pendingLauncherConfirmations.get(payload?.id);
  if (pending) {
    pending(Boolean(payload?.approved));
    pendingLauncherConfirmations.delete(payload.id);
  }
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send('launcher-confirmation-cleared', { id: payload?.id || null });
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
  const endpoint = String(payload?.endpoint || '');
  if (!/^https?:\/\//i.test(endpoint)) {
    return { ok: false, status: 400, body: 'Invalid endpoint', headers: { 'content-type': 'text/plain' } };
  }

  const timeoutMs = Number(payload?.timeoutMs) > 0 ? Number(payload.timeoutMs) : 45_000;
  try {
    const requestHeaders = {
      'Content-Type': 'application/json',
      'User-Agent': `JarvisDesktop/${app.getVersion()} Electron`,
      'Origin': new URL(endpoint).origin,
    };
    if (payload?.token) {
      requestHeaders['Authorization'] = `Bearer ${payload.token}`;
    }
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload?.payload || {}),
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
  const urlStr = typeof url === 'string' ? url.trim() : '';
  if (urlStr && !/^https?:\/\//i.test(urlStr)) {
    return { ok: false, error: 'Server URL must start with http:// or https://' };
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
    return { ok: true };
  } catch (error) {
    console.warn('[updater] Download failed:', error.message);
    emitUpdateStatus('error', `Download failed: ${error.message}`, { downloaded: false });
    return { ok: false, reason: error.message };
  }
});

ipcMain.handle('install-update', () => {
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

// Decodes the JWT payload (base64url) to extract claims such as email and sub.
// Signature verification is intentionally omitted: the token arrives directly
// from the Supabase OAuth callback URL over HTTPS and is used only for display
// purposes; authorization is enforced server-side on every API call.
function decodeJwtPayload(token) {
  try {
    const parts = String(token || '').split('.');
    if (parts.length < 2) return null;
    return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function parseCallbackUrl(url, loginWin, resolve) {
  try {
    const parsed = new URL(url);
    // Look for /auth/callback with an access_token fragment or query param
    if (!parsed.pathname.includes('/auth/callback') && !parsed.pathname.includes('/jarvis/callback')) return;

    const params = new URLSearchParams(parsed.hash.slice(1));
    const accessToken = params.get('access_token') || parsed.searchParams.get('access_token');

    if (accessToken) {
      const jwtPayload = decodeJwtPayload(accessToken);
      const email = params.get('email') || parsed.searchParams.get('email')
        || jwtPayload?.email || '';
      const userId = params.get('sub') || params.get('user_id') || parsed.searchParams.get('user_id')
        || jwtPayload?.sub || '';
      const refreshToken = params.get('refresh_token') || parsed.searchParams.get('refresh_token') || '';
      loginWin.close();
      resolve({ accessToken, refreshToken, email, userId, signedInAt: new Date().toISOString() });
    }
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      console.debug('[auth] Ignoring non-callback navigation URL during login handoff.');
    }
  }
}

app.whenReady().then(() => {
  startSidecar();
  createWindow();
  createLauncherOverlayWindow();
  createTray();
  registerLauncherShortcut();
  setupAutoUpdater();
  launcherService.refreshCatalog({ reason: 'app-ready' })
    .then(() => maybePromptEverythingRecommendation())
    .catch((error) => {
      console.warn('[launcher] startup refresh failed:', error.message);
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
