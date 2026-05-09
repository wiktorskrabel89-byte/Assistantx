const WebSocket = require('ws');
const { exec, execFile } = require('child_process');
const EventEmitter = require('events');
const os = require('os');
const path = require('path');

// ipcRenderer is available because this module runs in the Electron renderer
// process (loaded via renderer.js with nodeIntegration: true).
let ipcRenderer;
try {
  ipcRenderer = require('electron').ipcRenderer;
} catch {
  // Unit-test / non-Electron environment
  ipcRenderer = null;
}

const emitter = new EventEmitter();
const BACKEND_URL = process.env.JARVIS_BACKEND_URL || 'ws://127.0.0.1:8000/ws';

let ws;
let reconnectTimer;
let currentToken;

// --------------------------------------------------------------------------
// Connection management
// --------------------------------------------------------------------------

function emitStatus(status, detail) {
  emitter.emit('status', { status, detail, url: BACKEND_URL });
}

function connectToBackend(options = {}) {
  if (options.token) {
    currentToken = options.token;
  }

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return ws;
  }

  clearTimeout(reconnectTimer);
  emitStatus('connecting');

  ws = new WebSocket(BACKEND_URL);

  ws.on('open', () => {
    emitStatus('connected');
    sendMessageToBackend({ type: 'register', role: 'desktop', token: currentToken });
  });

  ws.on('message', (data) => {
    const text = data.toString();
    emitter.emit('message', text);

    try {
      const msg = JSON.parse(text);
      if (msg.type === 'command') {
        handleCommand(msg);
      }
    } catch (error) {
      emitStatus('warning', error.message);
    }
  });

  ws.on('close', () => {
    emitStatus('disconnected', 'Retrying in 3 seconds');
    reconnectTimer = setTimeout(() => connectToBackend({ token: currentToken }), 3000);
  });

  ws.on('error', (error) => {
    emitStatus('error', error.message);
  });

  return ws;
}

// --------------------------------------------------------------------------
// Messaging helpers
// --------------------------------------------------------------------------

function respond(text) {
  sendMessageToBackend({ type: 'response', text, token: currentToken });
  emitter.emit('message', JSON.stringify({ type: 'response', text }));
}

function sendMessageToBackend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

function sendDesktopPrompt(text, modelSettings = {}) {
  const payload = {
    type: 'desktop_prompt',
    text,
    token: currentToken,
    model: modelSettings.chatModel,
    speechToTextModel: modelSettings.sttModel,
    textToSpeechModel: modelSettings.ttsModel,
  };
  const sent = sendMessageToBackend(payload);
  emitter.emit('message', JSON.stringify({ type: 'outgoing', text, sent, ...modelSettings }));
  return sent;
}

// --------------------------------------------------------------------------
// Shell helpers
// --------------------------------------------------------------------------

function run(command, successMessage, errorMessage) {
  exec(command, (error) => respond(error ? `${errorMessage} ${error.message}` : successMessage));
}

// --------------------------------------------------------------------------
// Browser / URL helpers
// --------------------------------------------------------------------------

/**
 * Open a URL in the system default browser.
 * Uses Electron's shell.openExternal via IPC (main process).
 * URL must start with http:// or https://.
 */
function openUrl(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  if (ipcRenderer) {
    ipcRenderer.invoke('open-url', url)
      .then(() => respond(`Opened URL in browser: ${url}`))
      .catch((err) => respond(`Failed to open URL: ${err.message}`));
  } else {
    respond('URL opening requires Electron (ipcRenderer not available).');
  }
}

/**
 * Open a URL in Chrome (or the default browser if Chrome isn't found).
 * Uses shell.openExternal via IPC to avoid shell injection.
 */
function openChromeTab(url) {
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }

  // Try to launch Chrome directly via execFile (no shell interpolation of url).
  // execFile does NOT spawn a shell, so the url arg is passed literally.
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  const tryNext = (paths) => {
    if (paths.length === 0) {
      // Fall back to shell.openExternal via IPC
      openUrl(url);
      return;
    }
    execFile(paths[0], [url], (error) => {
      if (error) {
        tryNext(paths.slice(1));
      } else {
        respond(`Opened Chrome tab: ${url}`);
      }
    });
  };

  tryNext(chromePaths);
}

/**
 * Search the web for a query using the default browser.
 */
function searchWeb(query) {
  const encoded = encodeURIComponent(query);
  openUrl(`https://www.google.com/search?q=${encoded}`);
  respond(`Searching for: ${query}`);
}

/**
 * Open a YouTube search for a query.
 */
function searchYouTube(query) {
  const encoded = encodeURIComponent(query);
  openUrl(`https://www.youtube.com/results?search_query=${encoded}`);
  respond(`Searching YouTube for: ${query}`);
}

// --------------------------------------------------------------------------
// Application maps
// --------------------------------------------------------------------------

const APP_OPEN_MAP = {
  chrome: 'start chrome',
  firefox: 'start firefox',
  edge: 'start msedge',
  notepad: 'start notepad',
  roblox: 'start roblox:',
  spotify: 'start spotify:',
  discord: 'start discord:',
  steam: 'start steam:',
  explorer: 'start explorer',
  calc: 'start calc',
  calculator: 'start calc',
  cmd: 'start cmd',
  powershell: 'start powershell',
  taskmgr: 'start taskmgr',
  paint: 'start mspaint',
  vlc: 'start vlc',
  word: 'start winword',
  excel: 'start excel',
  powerpoint: 'start powerpnt',
  teams: 'start msteams:',
  zoom: 'start zoommtg:',
  vscode: 'start code',
  notepadpp: 'start notepad++',
};

const APP_KILL_MAP = {
  chrome: 'chrome.exe',
  firefox: 'firefox.exe',
  edge: 'msedge.exe',
  notepad: 'notepad.exe',
  discord: 'Discord.exe',
  spotify: 'Spotify.exe',
  teams: 'Teams.exe',
  zoom: 'Zoom.exe',
  vscode: 'Code.exe',
  vlc: 'vlc.exe',
};

function openApp(app) {
  const command = APP_OPEN_MAP[app.toLowerCase()];
  if (!command) {
    respond(`Unknown app: ${app}. Supported: ${Object.keys(APP_OPEN_MAP).join(', ')}`);
    return;
  }
  run(command, `Opened ${app}.`, `Failed to open ${app}.`);
}

function closeApp(app) {
  const processName = APP_KILL_MAP[app.toLowerCase()];
  if (!processName) {
    respond(`Unknown app: ${app}. Supported for close: ${Object.keys(APP_KILL_MAP).join(', ')}`);
    return;
  }
  run(`taskkill /IM ${processName} /F`, `Closed ${app}.`, `Failed to close ${app}.`);
}

// --------------------------------------------------------------------------
// System helpers
// --------------------------------------------------------------------------

function takeScreenshot() {
  const ts = Date.now();
  // Use $env:USERPROFILE (PowerShell syntax) instead of %USERPROFILE% (cmd.exe syntax)
  // so the environment variable is correctly expanded inside the PowerShell command.
  const screenshotPath = `$env:USERPROFILE\\Desktop\\jarvis_screenshot_${ts}.png`;
  const psCmd = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$b = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width,[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height)',
    '$g = [System.Drawing.Graphics]::FromImage($b)',
    '$g.CopyFromScreen(0,0,0,0,$b.Size)',
    `$b.Save('${screenshotPath}')`,
    '$g.Dispose()',
    '$b.Dispose()',
  ].join('; ');

  exec(`powershell -NoProfile -Command "${psCmd}"`, (error) => {
    if (error) {
      respond(`Screenshot failed: ${error.message}`);
      return;
    }
    respond(`Screenshot saved to Desktop: jarvis_screenshot_${ts}.png`);
    if (ipcRenderer) {
      // Resolve Desktop path via Node.js (works outside PowerShell context)
      const desktopPath = path.join(process.env.USERPROFILE || os.homedir(), 'Desktop');
      ipcRenderer.invoke('open-path', desktopPath);
    }
  });
}

function getSystemInfo() {
  const psCmd = [
    '$cpu = (Get-WmiObject Win32_Processor).Name',
    '$ram = [math]::Round((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)',
    '$os = (Get-WmiObject Win32_OperatingSystem).Caption',
    '$uptime = (Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime',
    'Write-Output "OS: $os | CPU: $cpu | RAM: ${ram}GB | Uptime: $([math]::Round($uptime.TotalHours,1))h"',
  ].join('; ');

  exec(`powershell -NoProfile -Command "${psCmd}"`, (error, stdout) => {
    respond(error ? `System info failed: ${error.message}` : stdout.trim());
  });
}

function listProcesses() {
  const psCmd =
    'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name,@{N="CPU(s)";E={[math]::Round($_.CPU,1)}},@{N="RAM(MB)";E={[math]::Round($_.WorkingSet/1MB,0)}} | Format-Table -AutoSize | Out-String';

  exec(`powershell -NoProfile -Command "${psCmd}"`, (error, stdout) => {
    respond(error ? `Failed to list processes: ${error.message}` : 'Top 10 processes:\n' + stdout.trim());
  });
}

function listDesktopFiles() {
  exec('dir %USERPROFILE%\\Desktop /B', (error, stdout) => {
    respond(error ? `Failed to list Desktop: ${error.message}` : 'Desktop files:\n' + stdout.trim());
  });
}

function setVolume(level) {
  // level: 0-100
  const scalar = Math.max(0, Math.min(100, level));
  // nircmd sets volume on a 0-65535 scale
  const nircmdLevel = Math.round((scalar / 100) * 65535);
  run(`nircmd.exe setsysvolume ${nircmdLevel}`, `Volume set to ${scalar}%.`, 'Volume change failed.');
}

function typeText(text) {
  // Escape characters that have special meaning in SendKeys syntax.
  // Use \[ and \] to avoid an ambiguous unescaped [ inside the character class.
  const sendKeysEscaped = text.replace(/[\[\]+^%~(){}]/g, (ch) => `{${ch}}`);

  // Build the PowerShell script and pass it as a base64-encoded command
  // to avoid any shell string injection (no user content is interpolated
  // into the command line — only the encoded script argument is passed).
  const psScript = [
    'Add-Type -AssemblyName System.Windows.Forms',
    `[System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(sendKeysEscaped)})`,
  ].join('; ');

  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');

  execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], (error) => {
    respond(error ? `Failed to type text: ${error.message}` : `Typed text successfully.`);
  });
}

// --------------------------------------------------------------------------
// Command dispatcher
// --------------------------------------------------------------------------

function handleCommand(msg) {
  const { command, app: appName, url, query, text, level } = msg;

  switch (command) {
    // Apps
    case 'openApp':
      return openApp(appName || '');
    case 'closeApp':
      return closeApp(appName || '');

    // Browser / web
    case 'openUrl':
      return openUrl(url || appName || '');
    case 'openChromeTab':
      return openChromeTab(url || appName || '');
    case 'searchWeb':
      return searchWeb(query || text || '');
    case 'searchYouTube':
      return searchYouTube(query || text || '');

    // Volume
    case 'volumeUp':
      return run('nircmd.exe changesysvolume 6554', 'Volume increased.', 'Volume change failed.');
    case 'volumeDown':
      return run('nircmd.exe changesysvolume -6554', 'Volume decreased.', 'Volume change failed.');
    case 'mute':
      return run('nircmd.exe mutesysvolume 2', 'Mute toggled.', 'Mute failed.');
    case 'setVolume':
      return setVolume(typeof level === 'number' ? level : parseInt(level, 10) || 50);

    // System
    case 'screenshot':
      return takeScreenshot();
    case 'sysinfo':
    case 'systemInfo':
      return getSystemInfo();
    case 'listProcesses':
      return listProcesses();
    case 'listDesktop':
      return listDesktopFiles();
    case 'typeText':
      return typeText(text || '');

    // Power management
    case 'lockScreen':
      return run('rundll32.exe user32.dll,LockWorkStation', 'Screen locked.', 'Screen lock failed.');
    case 'shutdown':
      return run('shutdown /s /t 30', 'Shutdown scheduled in 30 seconds. Run `shutdown /a` to cancel.', 'Shutdown failed.');
    case 'restart':
      return run('shutdown /r /t 30', 'Restart scheduled in 30 seconds. Run `shutdown /a` to cancel.', 'Restart failed.');
    case 'sleep':
      return run('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', 'Sleep requested.', 'Sleep failed.');
    case 'cancelShutdown':
      return run('shutdown /a', 'Shutdown/restart cancelled.', 'Cancel failed.');

    default:
      return respond(`Unknown command: ${command}`);
  }
}

// --------------------------------------------------------------------------
// Exports
// --------------------------------------------------------------------------

module.exports = {
  connectToBackend,
  sendDesktopPrompt,
  sendMessageToBackend,
  getCurrentToken: () => currentToken,
  onMessage: (callback) => emitter.on('message', callback),
  onStatus: (callback) => emitter.on('status', callback),
  getBackendUrl: () => BACKEND_URL,
};
