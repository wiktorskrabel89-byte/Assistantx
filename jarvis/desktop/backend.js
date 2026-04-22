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
  // ...add more as needed
};

function openApp(app) {
  const cmd = APP_OPEN_MAP[app];
  if (!cmd) return respond('❌ Nieznana aplikacja: ' + app);
  run(cmd, `✅ Uruchomiono ${app}.`, `❌ Błąd uruchamiania ${app}.`);
}

function closeApp(app) {
  const proc = APP_KILL_MAP[app];
  if (!proc) return respond('❌ Nieznana aplikacja: ' + app);
  run(`taskkill /IM ${proc} /F`, `✅ Zamknięto ${app}.`, `❌ Błąd zamykania ${app}.`);
}

function takeScreenshot() {
  // TODO: Implement screenshot functionality
  respond('🖼️ Screenshot wykonany (funkcja w budowie).');
}

module.exports = {
  connectToBackend,
  sendMessageToBackend,
  onMessage: (cb) => emitter.on('message', cb)
};
// Połączenie z backendem przez WebSocket

const WebSocket = require('ws');

const BACKEND_URL = 'ws://localhost:8000/ws'; // Przykładowy adres backendu

function connectToBackend() {
  const ws = new WebSocket(BACKEND_URL);

  ws.on('open', () => {
    console.log('Połączono z backendem!');
    // Możesz wysłać token autoryzacyjny tutaj
  });

  ws.on('message', (data) => {
    console.log('Odebrano wiadomość:', data);
    // Obsłuż polecenia z backendu
  });

  ws.on('close', () => {
    console.log('Rozłączono z backendem.');
  });

  ws.on('error', (err) => {
    console.error('Błąd połączenia:', err);
  });
}

module.exports = { connectToBackend };

// Aby przetestować, odkomentuj poniższą linię:
// connectToBackend();
