const fs = require('fs');
const path = require('path');
const os = require('os');
const { app, BrowserWindow, dialog, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const { getJarvisWebUrl } = require('./runtime-config');
const { spawn } = require('child_process');

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
let tray;
let updateInterval = null;
let lastUpdateCheckAt = 0;
const UPDATE_CHECK_INTERVAL_MS = Number(process.env.JARVIS_UPDATE_CHECK_INTERVAL_MS || 15 * 60 * 1000);
const UPDATE_CHECK_DEBOUNCE_MS = 10_000;
const RELEASE_REPO = 'wiktorskrabel89-byte/Assistantx';
const RELEASE_TAG = 'jarvis-latest';
const GITHUB_RELEASE_API = `https://api.github.com/repos/${RELEASE_REPO}/releases/tags/${RELEASE_TAG}`;
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
}

function emitUpdateStatus(status, detail, extra = {}) {
  updateState = {
    ...updateState,
    status,
    detail,
    ...extra,
  };
  sendToRenderer('auto-update-status', updateState);
}

function getJarvisWebBaseUrl() {
  return getJarvisWebUrl();
}

function getJarvisDownloadUrl() {
  const arch = os.arch() === 'arm64' ? 'arm64' : 'x64';
  return `${getJarvisWebBaseUrl()}/api/jarvis/download?platform=windows&arch=${arch}`;
}

function compareVersions(left, right) {
  const parse = (value) => String(value || '')
    .replace(/^v/i, '')
    .split('.')
    .map((segment) => Number.parseInt(segment, 10) || 0);

  const leftParts = parse(left);
  const rightParts = parse(right);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function isTransientFetchFailure(error) {
  const errorMessageLowerCase = String(error?.message || '').toLowerCase();
  return (
    errorMessageLowerCase.includes('fetch failed')
    || errorMessageLowerCase.includes('network')
    || errorMessageLowerCase.includes('econnrefused')
    || errorMessageLowerCase.includes('enotfound')
    || errorMessageLowerCase.includes('ehostunreach')
    || errorMessageLowerCase.includes('timed out')
    || errorMessageLowerCase.includes('timeout')
  );
}

async function fetchLatestJarvisReleaseFromServer() {
  try {
    const response = await fetch(`${getJarvisWebBaseUrl()}/api/jarvis/version`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const payload = await response.json();
    if (!payload?.available || !payload?.version) return null;

    return {
      version: payload.version,
      releaseNotes: String(payload.releaseNotes || ''),
      downloadUrl: payload.downloadUrlWindows || getJarvisDownloadUrl(),
    };
  } catch {
    return null;
  }
}

async function fetchLatestJarvisReleaseFromGitHub() {
  const response = await fetch(GITHUB_RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(8_000),
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from GitHub release endpoint`);
  }

  const release = await response.json();
  return {
    version: release.name || release.tag_name || RELEASE_TAG,
    releaseNotes: String(release.body || ''),
    downloadUrl: getJarvisDownloadUrl(),
  };
}

async function fetchLatestJarvisRelease() {
  const serverRelease = await fetchLatestJarvisReleaseFromServer();
  if (serverRelease) return serverRelease;
  return fetchLatestJarvisReleaseFromGitHub();
}

async function openUpdateDownload() {
  const downloadUrl = updateState.downloadUrl || getJarvisDownloadUrl();
  await shell.openExternal(downloadUrl);
  emitUpdateStatus('download-opened', 'Installer opened in your browser. Run it after download to update Jarvis.', {
    downloaded: false,
    downloadUrl,
  });
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
    if (isTransientFetchFailure(error)) {
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

ipcMain.handle('download-update', async () => {
  if (!app.isPackaged) {
    return { ok: false, reason: 'not-packaged' };
  }
  try {
    await openUpdateDownload();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
});

ipcMain.handle('install-update', () => {
  return { ok: false, reason: 'manual-installer-required' };
});

// ── Account login via browser window ─────────────────────────────────────────
// Opens the AssistantX web login page in a child BrowserWindow, waits for the
// OAuth callback URL to contain a session token, then closes the window and
// returns the session to the renderer.
ipcMain.handle('open-account-login', async () => {
  const webUrl = getJarvisWebBaseUrl();
  const loginUrl = `${webUrl}/auth/login?client=jarvis-desktop`;

  return new Promise((resolve, reject) => {
    const loginWin = new BrowserWindow({
      width: 480,
      height: 680,
      title: 'Sign in to AssistantX',
      parent: win || undefined,
      modal: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true },
    });

    loginWin.loadURL(loginUrl);

    // Detect callback URL carrying the session token
    loginWin.webContents.on('will-redirect', (_event, url) => {
      parseCallbackUrl(url, loginWin, resolve, reject);
    });
    loginWin.webContents.on('did-navigate', (_event, url) => {
      parseCallbackUrl(url, loginWin, resolve, reject);
    });

    loginWin.on('closed', () => resolve(null));
  });
});

function parseCallbackUrl(url, loginWin, resolve, reject) {
  try {
    const parsed = new URL(url);
    // Look for /auth/callback with an access_token fragment or query param
    if (!parsed.pathname.includes('/auth/callback') && !parsed.pathname.includes('/jarvis/callback')) return;

    const params = new URLSearchParams(parsed.hash.slice(1));
    const accessToken = params.get('access_token') || parsed.searchParams.get('access_token');
    const email = params.get('email') || parsed.searchParams.get('email') || '';
    const userId = params.get('sub') || params.get('user_id') || parsed.searchParams.get('user_id') || '';

    if (accessToken) {
      loginWin.close();
      resolve({ accessToken, email, userId, signedInAt: new Date().toISOString() });
    }
  } catch {
    reject(new Error('Could not parse auth callback URL'));
  }
}

app.whenReady().then(() => {
  startSidecar();
  createWindow();
  createTray();
  setupAutoUpdater();
});

app.on('window-all-closed', () => {
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
  if (process.platform !== 'darwin') {
    stopSidecar();
    app.quit();
  }
});

app.on('will-quit', () => {
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
