// jarvis/desktop/backend.js
// Połączenie z serwerem + obsługa komend PC

const WebSocket = require('ws');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const EventEmitter = require('events');

const emitter = new EventEmitter();
const BACKEND_URL = 'ws://localhost:8000';

let ws;

// ─── Połączenie ────────────────────────────────────────────────────────────────
function connectToBackend() {
  ws = new WebSocket(BACKEND_URL);

  ws.on('open', () => {
    console.log('[✓] Połączono z serwerem Jarvis');
    ws.send(JSON.stringify({ type: 'register', role: 'desktop' }));
  });

  ws.on('message', (data) => {
    emitter.emit('message', data.toString());
    try {
      const msg = JSON.parse(data);
      if (msg.type === 'command') handleCommand(msg);
    } catch {}
  });

  ws.on('close', () => {
    console.log('[!] Rozłączono. Ponawiam za 3s...');
    setTimeout(connectToBackend, 3000);
  });

  ws.on('error', err => console.error('[WS error]', err.message));
}

// ─── Wysyłanie odpowiedzi ──────────────────────────────────────────────────────
function respond(text) {
  sendMessageToBackend({ type: 'response', text });
  emitter.emit('message', JSON.stringify({ type: 'response', text }));
}

function sendMessageToBackend(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// ─── Obsługa komend ────────────────────────────────────────────────────────────
function handleCommand(msg) {
  const { command, app } = msg;
  console.log(`[komenda] ${command}${app ? ' → ' + app : ''}`);

  switch (command) {
    case 'openApp':   return openApp(app);
    case 'closeApp':  return closeApp(app);
    case 'volumeUp':  return run('nircmd.exe changesysvolume 6554',  '🔊 Głośność zwiększona.', '❌ Błąd głośności (zainstaluj NirCmd).');
    case 'volumeDown':return run('nircmd.exe changesysvolume -6554', '🔉 Głośność zmniejszona.', '❌ Błąd głośności.');
    case 'mute':      return run('nircmd.exe mutesysvolume 2',       '🔇 Wyciszono/odciszono.', '❌ Błąd wyciszenia.');
    case 'screenshot':return takeScreenshot();
    case 'lockScreen':return run('rundll32.exe user32.dll,LockWorkStation', '🔒 Ekran zablokowany.', '❌ Błąd blokady ekranu.');
    case 'shutdown':  return run('shutdown /s /t 30', '⏻ Wyłączam komputer za 30 sekund.', '❌ Błąd wyłączania.');
    case 'restart':   return run('shutdown /r /t 30', '🔄 Restart za 30 sekund.', '❌ Błąd restartu.');
    case 'sleep':     return run('rundll32.exe powrprof.dll,SetSuspendState 0,1,0', '😴 Usypiam komputer.', '❌ Błąd uśpienia.');
    default:          return respond(`❓ Nieznana komenda: ${command}`);
  }
}

function run(cmd, successMsg, errorMsg) {
  exec(cmd, err => respond(err ? errorMsg : successMsg));
}

// Mapa aplikacji: nazwa → komenda
const APP_OPEN_MAP = {
  chrome:    'start chrome',
  firefox:   'start firefox',
  notepad:   'start notepad',
  roblox:    'start roblox:',
  spotify:   'start spotify:',
  discord:   'start discord:',
  steam:     'start steam:',
  explorer:  'start explorer',
  calc:      'start calc',
  calculator:'start calc',
  cmd:       'start cmd',
  powershell:'start powershell',
  taskmgr:   'start taskmgr',
  paint:     'start mspaint',
  vlc:       'start vlc',
  word:      'start winword',
  excel:     'start excel',
};

const APP_KILL_MAP = {
  chrome:    'chrome.exe',
  firefox:   'firefox.exe',
  notepad:   'notepad.exe',
  spotify:   'Spotify.exe',
  discord:   'Discord.exe',
  steam:     'steam.exe',
  vlc:       'vlc.exe',
  word:      'WINWORD.EXE',
  excel:     'EXCEL.EXE',
};

function openApp(app) {
  if (!app) return respond('❓ Nie podano nazwy aplikacji.');
  const key = app.toLowerCase();
  const cmd = APP_OPEN_MAP[key] || `start ${key}`;
  exec(cmd, err => respond(err ? `❌ Nie można otworzyć "${app}".` : `✅ Otwieram ${app}!`));
}

function closeApp(app) {
  if (!app) return respond('❓ Nie podano nazwy aplikacji.');
  const key = app.toLowerCase();
  const proc = APP_KILL_MAP[key] || `${key}.exe`;
  exec(`taskkill /F /IM "${proc}"`, err => respond(err ? `❌ Nie można zamknąć "${app}".` : `✅ Zamknięto ${app}.`));
}

function takeScreenshot() {
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(os.homedir(), 'Desktop', `jarvis-${ts}.png`);
  const ps = `Add-Type -AssemblyName System.Windows.Forms,System.Drawing;
$s=[System.Windows.Forms.Screen]::PrimaryScreen;
$b=New-Object System.Drawing.Bitmap($s.Bounds.Width,$s.Bounds.Height);
$g=[System.Drawing.Graphics]::FromImage($b);
$g.CopyFromScreen($s.Bounds.Location,[System.Drawing.Point]::Empty,$s.Bounds.Size);
$b.Save('${dest.replace(/\\/g, '\\\\')}');`;
  exec(`powershell -Command "${ps}"`, err =>
    respond(err ? '❌ Błąd screenshota.' : `📸 Screenshot zapisany na Pulpicie!`)
  );
}

module.exports = { connectToBackend, sendMessageToBackend, onMessage: cb => emitter.on('message', cb) };
