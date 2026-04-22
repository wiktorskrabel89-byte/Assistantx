// jarvis/desktop/main.js
// Główny proces Electron + system tray

const { app, BrowserWindow, Tray, Menu, nativeImage } = require('electron');
const path = require('path');

let win = null;
let tray = null;

// Mała ikona 16x16 w base64 (możesz zastąpić własnym plikiem icon.png)
const ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAAAdgAAAHYBTnsmCAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABZSURBVDiNY2AYBfQHgP///xn+//9vwIABmBgGABswABswABswgIEBAxgYGBj+//9v8P//f4OBgQEDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDgx8AJysQFPFHGT0AAAAASUVORK5CYII=';

function createWindow() {
  win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
    icon: path.join(__dirname, 'icon.png'),
  });

  win.loadFile('index.html');

  // Minimalizuj do traya zamiast zamykać
  win.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      win.hide();
    }
  });
}

function createTray() {
  let icon;
  try {
    icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
  } catch {
    icon = nativeImage.createFromDataURL(`data:image/png;base64,${ICON_BASE64}`);
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const menu = Menu.buildFromTemplate([
    {
      label: '🤖 Jarvis',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Pokaż okno',
      click: () => { win.show(); win.focus(); }
    },
    {
      label: 'Ukryj okno',
      click: () => win.hide()
    },
    { type: 'separator' },
    {
      label: 'Zakończ',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Jarvis Desktop');
  tray.setContextMenu(menu);

  tray.on('click', () => {
    if (win.isVisible()) {
      win.hide();
    } else {
      win.show();
      win.focus();
    }
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────
require('./backend').connectToBackend();

app.whenReady().then(() => {
  createWindow();
  createTray();
});

// Nie zamykaj aplikacji gdy zamknięte wszystkie okna – działa w trayu
app.on('window-all-closed', () => {
  // Celowo puste – tray trzyma aplikację
});

app.on('activate', () => {
  if (win) win.show();
});
