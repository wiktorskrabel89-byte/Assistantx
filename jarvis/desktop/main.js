const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, ipcMain, shell, Tray, Menu, nativeImage } = require('electron');
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

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;

  autoUpdater.on('checking-for-update', () => {
    emitUpdateStatus('checking', 'Checking GitHub for a newer Jarvis build...', { downloaded: false });
  });

  autoUpdater.on('update-available', (info) => {
    emitUpdateStatus('downloading', `Update ${info.version} found. Downloading now...`, {
      downloaded: false,
      version: info.version,
    });
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

ipcMain.handle('check-for-updates', () => {
  return checkForUpdates();
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
