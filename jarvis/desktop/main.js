const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
const { autoUpdater } = require('electron-updater');

let win;
let tray;
let updateInterval = null;
let lastUpdateCheckAt = 0;
const UPDATE_CHECK_INTERVAL_MS = Number(process.env.JARVIS_UPDATE_CHECK_INTERVAL_MS || 15 * 60 * 1000);
const AUTO_INSTALL_ON_DOWNLOAD = process.env.JARVIS_AUTO_INSTALL_ON_DOWNLOAD === '1';
const UPDATE_CHECK_DEBOUNCE_MS = 10_000;
let updateState = {
  status: 'idle',
  detail: 'Waiting to check for updates.',
  downloaded: false,
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
    await autoUpdater.checkForUpdates();
    return { ok: true };
  } catch (error) {
    emitUpdateStatus('error', `Update check failed: ${error.message}`, { downloaded: false });
    return { ok: false, reason: error.message };
  }
}

function setupAutoUpdater() {
  if (!app.isPackaged) {
    emitUpdateStatus('disabled', 'Running in dev mode. Install the EXE build to enable auto-updates.');
    return;
  }

  // Do NOT download automatically — show a dialog first so the user can
  // read the changelog and decide when to update.
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    emitUpdateStatus('checking', 'Checking GitHub for a newer Jarvis build...', { downloaded: false });
  });

  autoUpdater.on('update-available', async (info) => {
    emitUpdateStatus('update-available', `Update ${info.version} available.`, {
      downloaded: false,
      version: info.version,
    });

    // Strip any HTML that GitHub may have added to the release body so the
    // text displays cleanly in the native OS dialog (plain text only).
    // A single combined replace avoids the multi-stage sanitization patterns
    // that CodeQL warns about.
    let notes = '';
    if (info.releaseNotes) {
      notes = String(info.releaseNotes)
        .replace(
          /<(?:br|\/p|\/div|\/li|\/h[1-6]|\/blockquote)(?:[^>]*)?>|<[^>]+>/gi,
          // Convert block-closing tags to newlines; drop everything else
          (tag) => (/^<(?:br|\/p|\/div|\/li|\/h[1-6]|\/blockquote)/i.test(tag) ? '\n' : ''),
        )
        .replace(/\n{3,}/g, '\n\n')
        .trim()
        .slice(0, 1500);
    }

    const detail = notes
      ? `What's new:\n\n${notes}`
      : 'No release notes available for this build.';

    let response;
    try {
      ({ response } = await dialog.showMessageBox(win ?? null, {
        type: 'info',
        title: 'Jarvis Update Available',
        message: `Jarvis ${info.version} is ready to download.`,
        detail,
        buttons: ['Update Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }));
    } catch {
      // If the dialog fails (e.g. no display), default to skipping.
      response = 1;
    }

    if (response === 0) {
      emitUpdateStatus('downloading', `Downloading Jarvis ${info.version}…`, {
        downloaded: false,
        version: info.version,
      });
      try {
        await autoUpdater.downloadUpdate();
      } catch (error) {
        emitUpdateStatus('error', `Download failed: ${error.message}`, { downloaded: false });
      }
    } else {
      emitUpdateStatus('update-skipped', `Update to ${info.version} postponed.`, {
        downloaded: false,
        version: info.version,
      });
    }
  });

  autoUpdater.on('download-progress', (progress) => {
    emitUpdateStatus('downloading', `Downloading update: ${Math.round(progress.percent)}%`, {
      downloaded: false,
      percent: progress.percent,
    });
  });

  autoUpdater.on('update-not-available', () => {
    emitUpdateStatus('up-to-date', 'Jarvis is already up to date.', { downloaded: false });
  });

  autoUpdater.on('update-downloaded', (info) => {
    emitUpdateStatus('ready-to-install', `Update ${info.version} downloaded. Restart Jarvis to install it.`, {
      downloaded: true,
      version: info.version,
    });
    if (AUTO_INSTALL_ON_DOWNLOAD) {
      emitUpdateStatus('installing', `Installing update ${info.version} now...`, {
        downloaded: true,
        version: info.version,
      });
      setTimeout(() => {
        autoUpdater.quitAndInstall(false, true);
      }, 1500);
    }
  });

  autoUpdater.on('error', (error) => {
    emitUpdateStatus('error', `Auto-update failed: ${error.message}`, { downloaded: false });
  });

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
  if (updateState.downloaded) {
    return { ok: true, reason: 'already-downloaded' };
  }
  try {
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error.message };
  }
});

ipcMain.handle('install-update', () => {
  if (!updateState.downloaded) {
    return { ok: false, reason: 'no-update-ready' };
  }

  setImmediate(() => {
    autoUpdater.quitAndInstall(false, true);
  });

  return { ok: true };
});

// ── Account login via browser window ─────────────────────────────────────────
// Opens the AssistantX web login page in a child BrowserWindow, waits for the
// OAuth callback URL to contain a session token, then closes the window and
// returns the session to the renderer.
ipcMain.handle('open-account-login', async () => {
  const webUrl = process.env.JARVIS_WEB_URL || 'http://localhost:3000';
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
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    win.show();
  }
  void checkForUpdates();
});
