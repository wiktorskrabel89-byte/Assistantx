const WebSocket = require('ws');
const { exec } = require('child_process');
const EventEmitter = require('events');

const emitter = new EventEmitter();
const BACKEND_URL = process.env.JARVIS_BACKEND_URL || 'ws://127.0.0.1:8000/ws';

let ws;
let reconnectTimer;
let currentToken;

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

function sendDesktopPrompt(text) {
  const payload = { type: 'desktop_prompt', text, token: currentToken };
  const sent = sendMessageToBackend(payload);

  emitter.emit('message', JSON.stringify({ type: 'outgoing', text, sent }));
  return sent;
}

function handleCommand(msg) {
  const { command, app } = msg;

  switch (command) {
    case 'openApp':
      return openApp(app);
    case 'closeApp':
      return closeApp(app);
    case 'volumeUp':
      return run('nircmd.exe changesysvolume 6554', 'Volume increased.', 'Volume change failed.');
    case 'volumeDown':
      return run('nircmd.exe changesysvolume -6554', 'Volume decreased.', 'Volume change failed.');
    case 'mute':
      return run('nircmd.exe mutesysvolume 2', 'Mute toggled.', 'Mute failed.');
    case 'screenshot':
      return takeScreenshot();
    case 'lockScreen':
      return run('rundll32.exe user32.dll,LockWorkStation', 'Screen locked.', 'Screen lock failed.');
    case 'shutdown':
      return run('shutdown /s /t 30', 'Shutdown scheduled in 30 seconds.', 'Shutdown failed.');
    case 'restart':
      return run('shutdown /r /t 30', 'Restart scheduled in 30 seconds.', 'Restart failed.');
    case 'sleep':
      return run('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', 'Sleep requested.', 'Sleep failed.');
    default:
      return respond(`Unknown command: ${command}`);
  }
}

function run(command, successMessage, errorMessage) {
  exec(command, (error) => respond(error ? `${errorMessage} ${error.message}` : successMessage));
}

const APP_OPEN_MAP = {
  chrome: 'start chrome',
  firefox: 'start firefox',
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
};

const APP_KILL_MAP = {
  chrome: 'chrome.exe',
  firefox: 'firefox.exe',
  notepad: 'notepad.exe',
  discord: 'Discord.exe',
};

function openApp(app) {
  const command = APP_OPEN_MAP[app];
  if (!command) {
    return respond(`Unknown app: ${app}`);
  }

  run(command, `Opened ${app}.`, `Failed to open ${app}.`);
}

function closeApp(app) {
  const processName = APP_KILL_MAP[app];
  if (!processName) {
    return respond(`Unknown app: ${app}`);
  }

  run(`taskkill /IM ${processName} /F`, `Closed ${app}.`, `Failed to close ${app}.`);
}

function takeScreenshot() {
  const screenshotPath = `screenshot_${Date.now()}.png`;
  const command = `powershell -command "Add-Type -AssemblyName System.Windows.Forms; Add-Type -AssemblyName System.Drawing; $bmp = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width, [System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height); $graphics = [System.Drawing.Graphics]::FromImage($bmp); $graphics.CopyFromScreen(0, 0, 0, 0, $bmp.Size); $bmp.Save('${screenshotPath}'); $graphics.Dispose(); $bmp.Dispose();"`;

  exec(command, (error) => {
    if (error) {
      respond(`Screenshot failed: ${error.message}`);
      return;
    }

    respond(`Screenshot saved as ${screenshotPath}`);
  });
}

module.exports = {
  connectToBackend,
  sendDesktopPrompt,
  sendMessageToBackend,
  onMessage: (callback) => emitter.on('message', callback),
  onStatus: (callback) => emitter.on('status', callback),
  getBackendUrl: () => BACKEND_URL,
};
