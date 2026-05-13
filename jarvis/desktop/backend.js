const fs = require('fs');
const WebSocket = require('ws');
const { execFile } = require('child_process');
const EventEmitter = require('events');
const os = require('os');
const path = require('path');
const { getJarvisApiUrl, isPackagedDesktopRuntime } = require('./runtime-config');
const {
  appendHistory,
  getFavoriteApp,
  readState,
  rememberApp,
  rememberFile,
  rememberPrompt,
  saveTask,
} = require('./local-state');
const { planPrompt } = require('./task-planner');

let ipcRenderer;
let clipboard;
try {
  const electron = require('electron');
  ipcRenderer = electron.ipcRenderer;
  clipboard = electron.clipboard;
} catch {
  ipcRenderer = null;
  clipboard = null;
}

// ── Platform detection ───────────────────────────────────────────────────────
const PLATFORM = process.platform; // 'win32', 'darwin', 'linux'

const emitter = new EventEmitter();
const DEFAULT_BACKEND_URL = isPackagedDesktopRuntime() ? '' : 'ws://127.0.0.1:8000/ws';
const BACKEND_URL = process.env.JARVIS_BACKEND_URL || DEFAULT_BACKEND_URL;
const REALTIME_EDGE_URL = process.env.JARVIS_REALTIME_URL || '';
const HEARTBEAT_INTERVAL_MS = Number(process.env.JARVIS_HEARTBEAT_INTERVAL_MS || 5000);
const USER_HOME = process.env.USERPROFILE || os.homedir();
const DEFAULT_FILE_ROOT = path.join(USER_HOME, 'Desktop');
const SAFE_ROOTS = [
  USER_HOME,
  path.join(USER_HOME, 'Desktop'),
  path.join(USER_HOME, 'Documents'),
  path.join(USER_HOME, 'Downloads'),
  path.join(USER_HOME, 'Pictures'),
].filter(Boolean);
const REMOTE_ALLOWED_COMMANDS = new Set([
  'openApp',
  'closeApp',
  'openUrl',
  'openChromeTab',
  'searchWeb',
  'searchYouTube',
  'screenshot',
  'sysinfo',
  'systemInfo',
  'listProcesses',
  'listDesktop',
  'listFiles',
  'readFile',
  'openFile',
  'typeText',
  'volumeUp',
  'volumeDown',
  'mute',
  'setVolume',
  'lockScreen',
  'sleep',
  'cancelShutdown',
  'readClipboard',
  'writeClipboard',
]);

// ── Command risk tiers ───────────────────────────────────────────────────────
// low    → auto-execute
// medium → require valid pairing token
// high   → require explicit phone approval before execution
const COMMAND_RISK_TIER = {
  screenshot: 'low',
  sysinfo: 'low',
  systemInfo: 'low',
  listProcesses: 'low',
  listDesktop: 'low',
  listFiles: 'low',
  readFile: 'low',
  readClipboard: 'low',
  volumeUp: 'low',
  volumeDown: 'low',
  mute: 'low',
  openApp: 'medium',
  closeApp: 'medium',
  openUrl: 'medium',
  openChromeTab: 'medium',
  searchWeb: 'medium',
  searchYouTube: 'medium',
  typeText: 'medium',
  openFile: 'medium',
  setVolume: 'medium',
  lockScreen: 'medium',
  cancelShutdown: 'medium',
  writeClipboard: 'medium',
  sleep: 'high',
  shutdown: 'high',
  restart: 'high',
};

// Pending approval requests from remote commands (approvalId → resolve fn)
const PENDING_APPROVALS = new Map();

let ws;
let realtimeWs;
let reconnectTimer;
let heartbeatTimer;
let realtimeReconnectTimer;
let currentToken;
let currentSessionId = null;
let currentResumeToken = null;
let taskCounter = 0;
let queueProcessing = false;
const taskQueue = [];

const APP_OPEN_MAP = {
  chrome: 'chrome',
  firefox: 'firefox',
  edge: 'msedge',
  notepad: 'notepad',
  roblox: ['roblox-player:', 'roblox:'],
  spotify: ['spotify', 'spotify:'],
  discord: ['discord', 'discord:'],
  steam: ['steam', 'steam://open/main'],
  explorer: 'explorer',
  calc: 'calc',
  calculator: 'calc',
  cmd: 'cmd',
  powershell: 'powershell',
  taskmgr: 'taskmgr',
  paint: 'mspaint',
  vlc: 'vlc',
  word: 'winword',
  excel: 'excel',
  powerpoint: 'powerpnt',
  teams: ['ms-teams:', 'msteams:'],
  zoom: ['zoommtg:', 'zoom'],
  vscode: 'code',
  notepadpp: 'notepad++',
};

// macOS app name mappings (used with `open -a <name>`)
const APP_OPEN_MAP_DARWIN = {
  chrome: 'Google Chrome',
  firefox: 'Firefox',
  safari: 'Safari',
  edge: 'Microsoft Edge',
  notepad: 'TextEdit',
  roblox: 'Roblox',
  spotify: 'Spotify',
  discord: 'Discord',
  steam: 'Steam',
  explorer: 'Finder',
  calc: 'Calculator',
  calculator: 'Calculator',
  taskmgr: 'Activity Monitor',
  vlc: 'VLC',
  word: 'Microsoft Word',
  excel: 'Microsoft Excel',
  powerpoint: 'Microsoft PowerPoint',
  teams: 'Microsoft Teams',
  zoom: 'zoom.us',
  vscode: 'Visual Studio Code',
};

const APP_CLOSE_MAP = {
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

// macOS close via AppleScript `quit`
const APP_CLOSE_MAP_DARWIN = {
  chrome: 'Google Chrome',
  firefox: 'Firefox',
  safari: 'Safari',
  edge: 'Microsoft Edge',
  discord: 'Discord',
  spotify: 'Spotify',
  teams: 'Microsoft Teams',
  zoom: 'zoom.us',
  vscode: 'Visual Studio Code',
  vlc: 'VLC',
};

function toIsoNow() {
  return new Date().toISOString();
}

function emitStatus(status, detail) {
  emitter.emit('status', { status, detail, url: BACKEND_URL });
}

function emitRawMessage(payload) {
  emitter.emit('message', JSON.stringify(payload));
}

function sendMessageToBackend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

async function buildPresencePayload() {
  const loadAvg = os.loadavg();
  const cpuLoad = Math.round(loadAvg[0] * 10) / 10;
  const totalRamMb = Math.round(os.totalmem() / 1024 / 1024);
  const freeRamMb = Math.round(os.freemem() / 1024 / 1024);

  let activeApps = [];
  try {
    if (PLATFORM === 'win32') {
      const psCmd = 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 5 -ExpandProperty Name | Get-Unique';
      const stdout = await execFilePromise('powershell.exe', ['-NoProfile', '-Command', psCmd]).catch(() => '');
      activeApps = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    } else if (PLATFORM === 'darwin') {
      const stdout = await execFilePromise('bash', ['-c', "ps -axco command -r | head -6 | tail -5"]).catch(() => '');
      activeApps = stdout.split('\n').map((s) => s.trim()).filter(Boolean);
    }
  } catch {
    // presence data is best-effort
  }

  return {
    status: queueProcessing ? 'busy' : 'online',
    activeApps,
    cpu: cpuLoad,
    freeRamMb,
    totalRamMb,
    networkMode: REALTIME_EDGE_URL ? 'relay' : 'unknown',
  };
}

function sendRealtimeEdge(payload) {
  if (realtimeWs && realtimeWs.readyState === WebSocket.OPEN) {
    realtimeWs.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

async function publishHeartbeat() {
  const presence = await buildPresencePayload();
  const heartbeatPayload = {
    type: 'device_status',
    role: 'desktop',
    status: presence.status,
    activeApps: presence.activeApps,
    cpu: presence.cpu,
    freeRamMb: presence.freeRamMb,
    totalRamMb: presence.totalRamMb,
    networkMode: presence.networkMode,
    token: currentToken,
    createdAt: toIsoNow(),
  };
  sendMessageToBackend(heartbeatPayload);
  sendRealtimeEdge({
    type: 'heartbeat',
    id: `hb-${Date.now()}`,
    ...presence,
    sessionId: currentSessionId,
  });
}

function publishTaskUpdate(update) {
  const payload = {
    type: 'task_update',
    createdAt: toIsoNow(),
    ...update,
  };
  if (payload.task) saveTask(payload.task);
  sendMessageToBackend({ ...payload, token: currentToken });
  emitRawMessage(payload);
}

function publishResult(result) {
  const payload = {
    type: 'command_result',
    createdAt: toIsoNow(),
    ...result,
  };
  appendHistory(payload);
  sendMessageToBackend({ ...payload, token: currentToken });
  emitRawMessage(payload);
  return payload;
}

function respond(text, extra = {}) {
  return publishResult({
    title: extra.title || 'Jarvis response',
    summary: text,
    text,
    level: extra.level || 'info',
    ...extra,
  });
}

function execFilePromise(file, args) {
  return new Promise((resolve, reject) => {
    execFile(file, args, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve((stdout || '').trim());
    });
  });
}

function ensureSafePath(targetPath) {
  const raw = String(targetPath || '').trim();
  const resolved = raw
    ? path.resolve(path.normalize(raw.includes(':') ? raw : path.join(DEFAULT_FILE_ROOT, raw)))
    : DEFAULT_FILE_ROOT;
  const allowed = SAFE_ROOTS.some((root) => resolved.toLowerCase().startsWith(path.resolve(root).toLowerCase()));
  if (!allowed) {
    throw new Error(`Access denied for path: ${resolved}`);
  }
  return resolved;
}

function normalizeHttpUrl(rawUrl) {
  const input = String(rawUrl || '').trim();
  if (!input) throw new Error('Missing URL.');
  if (/[\r\n]/.test(input)) {
    throw new Error('Invalid URL.');
  }
  const withProtocol = input.startsWith('http://') || input.startsWith('https://')
    ? input
    : `https://${input}`;
  const parsed = new URL(withProtocol);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs are allowed.');
  }
  return parsed.toString();
}

function getHttpBaseUrl(url) {
  return String(url || '')
    .replace(/^wss?:\/\//, (match) => (match === 'wss://' ? 'https://' : 'http://'))
    .replace(/\/ws\/?$/, '')
    .replace(/\/$/, '');
}

function getJarvisAiEndpointCandidates() {
  const apiBaseUrl = getJarvisApiUrl();
  const candidates = [
    process.env.JARVIS_AI_URL,
    apiBaseUrl ? `${apiBaseUrl}/api/chat` : null,
    `${getHttpBaseUrl(BACKEND_URL)}/chat`,
  ].filter(Boolean);

  return [...new Set(candidates)];
}

async function extractAiResponseText(response) {
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();

  if (contentType.includes('application/json')) {
    const payload = await response.json();
    return String(payload?.text || payload?.response || payload?.answer || '').trim();
  }

  const raw = await response.text();
  let collected = '';

  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;

    try {
      const parsed = JSON.parse(data);
      if (typeof parsed.token === 'string') {
        collected += parsed.token;
      } else if (typeof parsed.text === 'string') {
        collected += parsed.text;
      } else if (typeof parsed.error === 'string') {
        throw new Error(parsed.error);
      }
    } catch (error) {
      if (!data.startsWith('{') && !data.startsWith('[')) {
        collected += data;
        continue;
      }
      throw error;
    }
  }

  return collected.trim();
}

async function runAiPrompt(prompt, meta = {}) {
  let lastError = null;

  for (const endpoint of getJarvisAiEndpointCandidates()) {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: prompt,
          mode: 'auto',
        }),
        signal: AbortSignal.timeout(45_000),
      });

      if (!response.ok) {
        throw new Error(`AI request failed (${response.status}) at ${endpoint}`);
      }

      const answer = await extractAiResponseText(response);
      if (!answer) {
        throw new Error(`AI endpoint returned an empty response at ${endpoint}`);
      }

      return publishResult({
        title: 'Jarvis AI',
        text: answer,
        summary: answer,
        source: meta.source || 'local',
        origin: meta.origin || 'desktop',
        taskId: meta.taskId || null,
      });
    } catch (error) {
      lastError = error;
    }
  }

  return publishResult({
    title: 'AI unavailable',
    text: lastError?.message || 'Jarvis could not reach any AI endpoint.',
    summary: lastError?.message || 'Jarvis could not reach any AI endpoint.',
    level: 'error',
    source: meta.source || 'local',
    origin: meta.origin || 'desktop',
    taskId: meta.taskId || null,
  });
}

async function openUrl(url) {
  const nextUrl = normalizeHttpUrl(url);
  if (ipcRenderer) {
    await ipcRenderer.invoke('open-url', nextUrl);
  } else {
    await execFilePromise('cmd.exe', ['/c', 'start', '', nextUrl]);
  }
  return { summary: `Opened URL in browser: ${nextUrl}`, url: nextUrl };
}

async function openChromeTab(url) {
  const nextUrl = normalizeHttpUrl(url);
  const chromePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const chromePath of chromePaths) {
    try {
      await execFilePromise(chromePath, [nextUrl]);
      return { summary: `Opened Chrome tab: ${nextUrl}`, url: nextUrl };
    } catch {
      // try next path
    }
  }
  return openUrl(nextUrl);
}

async function searchWeb(query) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) throw new Error('Missing search query.');
  await openUrl(`https://www.google.com/search?q=${encodeURIComponent(normalizedQuery)}`);
  return { summary: `Searching the web for: ${normalizedQuery}` };
}

async function searchYouTube(query) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) throw new Error('Missing YouTube search query.');
  await openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(normalizedQuery)}`);
  return { summary: `Searching YouTube for: ${normalizedQuery}` };
}

async function openApp(app) {
  const rawApp = String(app || '').trim();
  const normalized = rawApp.toLowerCase();
  if (!rawApp) throw new Error('Missing app name.');

  if (PLATFORM === 'darwin') {
    const appName = APP_OPEN_MAP_DARWIN[normalized] || rawApp;
    await execFilePromise('open', ['-a', appName]);
    rememberApp(normalized);
    return { summary: `Opened ${appName}.`, app: normalized };
  }

  const targets = APP_OPEN_MAP[normalized];
  const launchCandidates = targets
    ? (Array.isArray(targets) ? targets : [targets])
    : [...new Set([
      rawApp,
      rawApp.replace(/^['"]|['"]$/g, ''),
      rawApp.toLowerCase().endsWith('.exe') ? null : `${rawApp}.exe`,
    ].filter(Boolean))];
  let lastError = null;

  for (const candidate of launchCandidates) {
    try {
      if (targets) {
        await execFilePromise('cmd.exe', ['/c', 'start', '', candidate]);
      } else {
        await execFilePromise('powershell.exe', [
          '-NoProfile',
          '-Command',
          `Start-Process -FilePath ${JSON.stringify(candidate)}`,
        ]);
      }
      rememberApp(normalized);
      return { summary: `Opened ${rawApp}.`, app: normalized };
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(`${lastError?.message || `Failed to open app: ${rawApp}`}. Tried: ${launchCandidates.join(', ')}`);
}

async function closeApp(app) {
  const normalized = String(app || '').trim().toLowerCase();
  if (PLATFORM === 'darwin') {
    const appName = APP_CLOSE_MAP_DARWIN[normalized] || normalized;
    await execFilePromise('osascript', ['-e', `tell application "${appName}" to quit`]);
    return { summary: `Closed ${appName}.`, app: normalized };
  }
  const processName = APP_CLOSE_MAP[normalized];
  if (!processName) throw new Error(`Unknown app: ${app}. Supported for close: ${Object.keys(APP_CLOSE_MAP).join(', ')}`);
  await execFilePromise('taskkill.exe', ['/IM', processName, '/F']);
  return { summary: `Closed ${normalized}.`, app: normalized };
}

async function takeScreenshot(displayIndex = 0) {
  const ts = Date.now();
  const desktopDir = PLATFORM === 'darwin' ? path.join(os.homedir(), 'Desktop') : path.join(USER_HOME, 'Desktop');
  const screenshotPath = path.join(desktopDir, `jarvis_screenshot_${ts}.png`);

  if (PLATFORM === 'darwin') {
    // macOS: screencapture -D uses 1-based display indices (1 = primary, 2 = second, etc.)
    const displayArg = ['-D', String(displayIndex + 1)];
    await execFilePromise('screencapture', ['-x', '-t', 'png', ...displayArg, screenshotPath]);
  } else {
    // Windows: PowerShell GDI capture with optional multi-monitor bounds
    let boundsArgs = [
      '$b = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width,[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height)',
      '$g = [System.Drawing.Graphics]::FromImage($b)',
      '$g.CopyFromScreen(0,0,0,0,$b.Size)',
    ];
    if (ipcRenderer) {
      try {
        const displays = await ipcRenderer.invoke('get-displays').catch(() => null);
        if (displays && displays[displayIndex]) {
          const { x, y, width, height } = displays[displayIndex].bounds;
          boundsArgs = [
            `$b = New-Object System.Drawing.Bitmap(${width},${height})`,
            '$g = [System.Drawing.Graphics]::FromImage($b)',
            `$g.CopyFromScreen(${x},${y},0,0,$b.Size)`,
          ];
        }
      } catch { /* fall back to primary */ }
    }
    const escapedPath = screenshotPath.replace(/'/g, "''");
    const psCmd = [
      'Add-Type -AssemblyName System.Windows.Forms',
      'Add-Type -AssemblyName System.Drawing',
      ...boundsArgs,
      `$b.Save('${escapedPath}')`,
      '$g.Dispose()',
      '$b.Dispose()',
    ].join('; ');
    await execFilePromise('powershell.exe', ['-NoProfile', '-Command', psCmd]);
  }

  const imageDataUrl = `data:image/png;base64,${(await fs.promises.readFile(screenshotPath)).toString('base64')}`;
  if (ipcRenderer) {
    void ipcRenderer.invoke('open-path', path.dirname(screenshotPath));
  }
  rememberFile(screenshotPath);

  // Vision: describe screen content if API key is configured
  const description = await describeScreenshot(imageDataUrl);

  return {
    summary: description
      ? `Screenshot captured: ${path.basename(screenshotPath)}\n\nScreen content:\n${description}`
      : `Screenshot captured: ${path.basename(screenshotPath)}`,
    imageDataUrl,
    path: screenshotPath,
    title: 'Screenshot ready',
    screenDescription: description || null,
  };
}

// ── Vision / OCR ─────────────────────────────────────────────────────────────
// Describe a screenshot using Gemini vision API (requires JARVIS_VISION_API_KEY).
async function describeScreenshot(imageDataUrl) {
  const apiKey = process.env.JARVIS_VISION_API_KEY;
  if (!apiKey) return null;
  try {
    const base64Data = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: 'Briefly describe what is visible on this computer screen: open applications, visible text, and any notable UI elements. Be concise (3-5 sentences).' },
              { inlineData: { mimeType: 'image/png', data: base64Data } },
            ],
          }],
        }),
      },
    );
    const data = await response.json();
    return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
  } catch {
    return null;
  }
}

async function getSystemInfo() {
  if (PLATFORM === 'darwin') {
    const cpuBrand = await execFilePromise('sysctl', ['-n', 'machdep.cpu.brand_string']).catch(() => 'Unknown CPU');
    const memBytes = await execFilePromise('sysctl', ['-n', 'hw.memsize']).catch(() => '0');
    const osVer = await execFilePromise('sw_vers', ['-productVersion']).catch(() => 'Unknown');
    const uptimeSec = await execFilePromise('sysctl', ['-n', 'kern.boottime']).catch(() => '');
    const ramGb = (parseInt(memBytes, 10) / 1024 / 1024 / 1024).toFixed(1);
    return { summary: `OS: macOS ${osVer} | CPU: ${cpuBrand} | RAM: ${ramGb}GB | Boot: ${uptimeSec.slice(0, 40)}` };
  }
  const psCmd = [
    '$cpu = (Get-WmiObject Win32_Processor).Name',
    '$ram = [math]::Round((Get-WmiObject Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)',
    '$os = (Get-WmiObject Win32_OperatingSystem).Caption',
    '$uptime = (Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime',
    'Write-Output "OS: $os | CPU: $cpu | RAM: ${ram}GB | Uptime: $([math]::Round($uptime.TotalHours,1))h"',
  ].join('; ');
  const stdout = await execFilePromise('powershell.exe', ['-NoProfile', '-Command', psCmd]);
  return { summary: stdout };
}

async function listProcesses() {
  if (PLATFORM === 'darwin') {
    const stdout = await execFilePromise('bash', ['-c', 'ps -axco pid,pcpu,pmem,command -r | head -11']).catch(() => '');
    return { summary: `Top processes:\n${stdout}` };
  }
  const psCmd = 'Get-Process | Sort-Object CPU -Descending | Select-Object -First 10 Name,@{N="CPU(s)";E={[math]::Round($_.CPU,1)}},@{N="RAM(MB)";E={[math]::Round($_.WorkingSet/1MB,0)}} | Format-Table -AutoSize | Out-String';
  const stdout = await execFilePromise('powershell.exe', ['-NoProfile', '-Command', psCmd]);
  return { summary: `Top 10 processes:\n${stdout}` };
}

async function listDesktopFiles() {
  return listFiles(DEFAULT_FILE_ROOT);
}

async function listFiles(targetPath) {
  const safePath = ensureSafePath(targetPath);
  const entries = await fs.promises.readdir(safePath, { withFileTypes: true });
  const topEntries = entries.slice(0, 40).map((entry) => `${entry.isDirectory() ? '📁' : '📄'} ${entry.name}`);
  rememberFile(safePath);
  return {
    summary: `Contents of ${safePath}:\n${topEntries.join('\n') || '(empty)'}`,
    path: safePath,
    entries: topEntries,
    title: 'Directory listing',
  };
}

async function readFile(targetPath) {
  const safePath = ensureSafePath(targetPath);
  const stat = await fs.promises.stat(safePath);
  if (!stat.isFile()) throw new Error('Selected path is not a file.');
  if (stat.size > 200_000) throw new Error('File is too large to read safely.');
  const raw = await fs.promises.readFile(safePath);
  const text = raw.toString('utf-8');
  rememberFile(safePath);
  return {
    summary: `Read ${safePath}:\n${text.slice(0, 4000)}${text.length > 4000 ? '\n…truncated…' : ''}`,
    path: safePath,
    title: 'File contents',
  };
}

async function openFile(targetPath) {
  const safePath = ensureSafePath(targetPath);
  if (ipcRenderer) {
    await ipcRenderer.invoke('open-path', safePath);
  } else {
    await execFilePromise('cmd.exe', ['/c', 'start', '', safePath]);
  }
  rememberFile(safePath);
  return { summary: `Opened path: ${safePath}`, path: safePath };
}

// ── Clipboard ─────────────────────────────────────────────────────────────────
function readClipboard() {
  const text = clipboard ? clipboard.readText() : '';
  return { summary: text ? `Clipboard contents:\n${text}` : 'Clipboard is empty.', text };
}

function writeClipboard(text) {
  if (!clipboard) throw new Error('Clipboard is not available in this environment.');
  clipboard.writeText(String(text || ''));
  return { summary: 'Text copied to clipboard.' };
}

async function typeText(text) {
  if (PLATFORM === 'darwin') {
    // Use keystroke with a string literal via AppleScript — we pass the text as
    // a quoted AppleScript string. Escape backslashes and double-quotes so the
    // interpreter cannot break out of the string context.
    const safe = String(text || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    await execFilePromise('osascript', ['-e', `tell application "System Events" to keystroke "${safe}"`]);
    return { summary: 'Typed text successfully.' };
  }
  // Windows: use SendKeys via PowerShell EncodedCommand (base64, no shell expansion)
  const sendKeysEscaped = String(text || '').replace(/[\[\]+^%~(){}]/g, (ch) => `{${ch}}`);
  const psScript = [
    'Add-Type -AssemblyName System.Windows.Forms',
    `[System.Windows.Forms.SendKeys]::SendWait(${JSON.stringify(sendKeysEscaped)})`,
  ].join('; ');
  const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
  await execFilePromise('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded]);
  return { summary: 'Typed text successfully.' };
}

async function setVolume(level) {
  const scalar = Math.max(0, Math.min(100, Number(level) || 50));
  if (PLATFORM === 'darwin') {
    await execFilePromise('osascript', ['-e', `set volume output volume ${scalar}`]);
    return { summary: `Volume set to ${scalar}%.`, level: scalar };
  }
  const nircmdLevel = Math.round((scalar / 100) * 65535);
  await execFilePromise('nircmd.exe', ['setsysvolume', String(nircmdLevel)]);
  return { summary: `Volume set to ${scalar}%.`, level: scalar };
}

function isCommandAllowed(command, context = {}) {
  if (context.source !== 'remote') return true;
  return REMOTE_ALLOWED_COMMANDS.has(command);
}

async function executeStructuredCommand(msg, context = {}) {
  const { command, app: appName, url, query, text, level, targetPath } = msg;
  if (!isCommandAllowed(command, context)) {
    return respond(`Blocked remote command: ${command}`, {
      level: 'warning',
      title: 'Action blocked',
      taskId: context.taskId || null,
      source: context.source || 'remote',
    });
  }

  // ── Risk tier enforcement ────────────────────────────────────────────────
  if (context.source === 'remote' && !msg.confirmed) {
    const tier = COMMAND_RISK_TIER[command] || 'medium';
    if (tier === 'high') {
      const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      // Ask phone for confirmation — phone must reply with an approval_response
      sendMessageToBackend({
        type: 'approval_required',
        approvalId,
        command,
        tier,
        token: currentToken,
        createdAt: toIsoNow(),
        message: `⚠️ High-risk command "${command}" requires phone confirmation (approvalId: ${approvalId}).`,
      });
      emitRawMessage({
        type: 'approval_required',
        approvalId,
        command,
        tier,
        createdAt: toIsoNow(),
      });

      // Wait up to 30 s for phone approval
      const approved = await new Promise((resolve) => {
        const tid = setTimeout(() => {
          PENDING_APPROVALS.delete(approvalId);
          resolve(false);
        }, 30_000);
        PENDING_APPROVALS.set(approvalId, { resolve, timeoutId: tid });
      });

      if (!approved) {
        return respond(`⏱ High-risk command "${command}" timed out waiting for phone approval.`, {
          level: 'warning',
          title: 'Approval timeout',
          taskId: context.taskId || null,
        });
      }
    }
  }

  try {
    let result;
    switch (command) {
      case 'openApp':
        result = await openApp(appName || msg.appName || '');
        break;
      case 'closeApp':
        result = await closeApp(appName || '');
        break;
      case 'openUrl':
        result = await openUrl(url || appName || '');
        break;
      case 'openChromeTab':
        result = await openChromeTab(url || appName || '');
        break;
      case 'searchWeb':
        result = await searchWeb(query || text || '');
        break;
      case 'searchYouTube':
        result = await searchYouTube(query || text || '');
        break;
      case 'volumeUp':
        if (PLATFORM === 'darwin') {
          await execFilePromise('osascript', ['-e', 'set volume output volume (output volume of (get volume settings) + 10)']);
        } else {
          await execFilePromise('nircmd.exe', ['changesysvolume', '6554']);
        }
        result = { summary: 'Volume increased.' };
        break;
      case 'volumeDown':
        if (PLATFORM === 'darwin') {
          await execFilePromise('osascript', ['-e', 'set volume output volume (output volume of (get volume settings) - 10)']);
        } else {
          await execFilePromise('nircmd.exe', ['changesysvolume', '-6554']);
        }
        result = { summary: 'Volume decreased.' };
        break;
      case 'mute':
        if (PLATFORM === 'darwin') {
          await execFilePromise('osascript', ['-e', 'set volume output muted (not output muted of (get volume settings))']);
        } else {
          await execFilePromise('nircmd.exe', ['mutesysvolume', '2']);
        }
        result = { summary: 'Mute toggled.' };
        break;
      case 'setVolume':
        result = await setVolume(level || msg.level);
        break;
      case 'screenshot':
        result = await takeScreenshot(Number(msg.displayIndex) || 0);
        break;
      case 'sysinfo':
      case 'systemInfo':
        result = await getSystemInfo();
        break;
      case 'listProcesses':
        result = await listProcesses();
        break;
      case 'listDesktop':
        result = await listDesktopFiles();
        break;
      case 'listFiles':
        result = await listFiles(targetPath || msg.path || '');
        break;
      case 'readFile':
        result = await readFile(targetPath || msg.path || '');
        break;
      case 'openFile':
        result = await openFile(targetPath || msg.path || '');
        break;
      case 'typeText':
        result = await typeText(text || '');
        break;
      case 'readClipboard':
        result = readClipboard();
        break;
      case 'writeClipboard':
        result = writeClipboard(text || msg.clipboardText || '');
        break;
      case 'lockScreen':
        if (PLATFORM === 'darwin') {
          await execFilePromise('pmset', ['displaysleepnow']);
        } else {
          await execFilePromise('rundll32.exe', ['user32.dll,LockWorkStation']);
        }
        result = { summary: 'Screen locked.' };
        break;
      case 'shutdown':
        if (PLATFORM === 'darwin') {
          await execFilePromise('osascript', ['-e', 'tell application "System Events" to shut down']);
        } else {
          await execFilePromise('shutdown.exe', ['/s', '/t', '30']);
        }
        result = { summary: 'Shutdown scheduled in 30 seconds.' };
        break;
      case 'restart':
        if (PLATFORM === 'darwin') {
          await execFilePromise('osascript', ['-e', 'tell application "System Events" to restart']);
        } else {
          await execFilePromise('shutdown.exe', ['/r', '/t', '30']);
        }
        result = { summary: 'Restart scheduled in 30 seconds.' };
        break;
      case 'sleep':
        if (PLATFORM === 'darwin') {
          await execFilePromise('pmset', ['sleepnow']);
        } else {
          await execFilePromise('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']);
        }
        result = { summary: 'Sleep requested.' };
        break;
      case 'cancelShutdown':
        if (PLATFORM !== 'darwin') {
          await execFilePromise('shutdown.exe', ['/a']);
        }
        result = { summary: 'Shutdown/restart cancelled.' };
        break;
      default: {
        // ── Plugin commands ──────────────────────────────────────────────
        const plugin = PLUGIN_COMMANDS[command];
        if (plugin) {
          result = await plugin.execute(msg);
        } else {
          throw new Error(`Unknown command: ${command}`);
        }
      }
    }

    return publishResult({
      title: result.title || 'Command completed',
      text: result.summary,
      summary: result.summary,
      taskId: context.taskId || null,
      command,
      source: context.source || 'local',
      origin: context.origin || 'desktop',
      ...result,
    });
  } catch (error) {
    return publishResult({
      title: 'Command failed',
      text: error.message,
      summary: error.message,
      taskId: context.taskId || null,
      command,
      level: 'error',
      source: context.source || 'local',
      origin: context.origin || 'desktop',
    });
  }
}

async function processTaskQueue() {
  if (queueProcessing) return;
  queueProcessing = true;

  while (taskQueue.length > 0) {
    const task = taskQueue.shift();
    task.status = 'running';
    task.startedAt = toIsoNow();
    publishTaskUpdate({
      taskId: task.id,
      status: 'running',
      progress: 0,
      prompt: task.prompt,
      summary: task.summary,
      source: task.source,
      task,
    });

    for (let index = 0; index < task.steps.length; index += 1) {
      const step = task.steps[index];
      publishTaskUpdate({
        taskId: task.id,
        status: 'step',
        progress: Math.round((index / task.steps.length) * 100),
        currentStep: step.label,
        prompt: task.prompt,
        summary: task.summary,
        source: task.source,
        task,
      });
      await executeStructuredCommand(step, {
        source: task.source,
        taskId: task.id,
        origin: task.origin,
      });
    }

    task.status = 'completed';
    task.completedAt = toIsoNow();
    saveTask(task);
    publishTaskUpdate({
      taskId: task.id,
      status: 'completed',
      progress: 100,
      prompt: task.prompt,
      summary: task.summary,
      source: task.source,
      task,
    });
  }

  queueProcessing = false;
}

function queuePromptExecution(text, meta = {}) {
  const prompt = String(text || '').trim();
  if (!prompt) return null;
  rememberPrompt(prompt);
  const plan = planPrompt(prompt, { favoriteApp: getFavoriteApp() });

  if (plan.steps.length === 0) {
    void runAiPrompt(prompt, meta);
    return null;
  }

  const task = {
    id: `task-${Date.now()}-${++taskCounter}`,
    prompt,
    source: meta.source || 'local',
    origin: meta.origin || 'desktop',
    createdAt: toIsoNow(),
    status: 'queued',
    steps: plan.steps,
    summary: plan.summary,
    unmatched: plan.unmatched,
  };
  saveTask(task);
  taskQueue.push(task);
  publishTaskUpdate({
    taskId: task.id,
    status: 'queued',
    progress: 0,
    prompt,
    summary: plan.summary,
    source: task.source,
    task,
  });
  void processTaskQueue();
  return task.id;
}

function connectToRealtimeEdge() {
  if (!REALTIME_EDGE_URL || !currentToken) return null;
  if (realtimeWs && (realtimeWs.readyState === WebSocket.OPEN || realtimeWs.readyState === WebSocket.CONNECTING)) {
    return realtimeWs;
  }

  clearTimeout(realtimeReconnectTimer);
  const separator = REALTIME_EDGE_URL.includes('?') ? '&' : '?';
  const resumeParam = currentResumeToken ? `&resumeToken=${encodeURIComponent(currentResumeToken)}` : '';
  const realtimeUrl = `${REALTIME_EDGE_URL}${separator}channel=runtime&token=${encodeURIComponent(currentToken)}&deviceId=${encodeURIComponent(currentToken)}${resumeParam}`;

  realtimeWs = new WebSocket(realtimeUrl);
  realtimeWs.on('open', () => {
    void publishHeartbeat();
  });

  realtimeWs.on('message', (data) => {
    const text = data.toString();
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'connected') {
        currentSessionId = msg.sessionId || currentSessionId;
        currentResumeToken = msg.resumeToken || currentResumeToken;
        if (currentResumeToken) {
          sendRealtimeEdge({ type: 'resume', resumeToken: currentResumeToken });
        }
      }
      if (msg.type === 'runtime_command') {
        void executeStructuredCommand(
          { command: msg.command, ...msg.args },
          { source: 'remote', taskId: msg.workflowId || null, origin: 'mobile' },
        );
      }
    } catch {
      // ignore parse failures from edge logs/noise
    }
  });

  realtimeWs.on('close', () => {
    realtimeReconnectTimer = setTimeout(() => connectToRealtimeEdge(), 3000);
  });

  realtimeWs.on('error', () => {
    try {
      realtimeWs.close();
    } catch {
      // noop
    }
  });

  return realtimeWs;
}

function connectToBackend(options = {}) {
  if (options.token) currentToken = options.token;

  if (!BACKEND_URL) {
    emitStatus('ready', 'Remote backend is not configured. Local commands still work.');
    return null;
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
    void publishHeartbeat();
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => void publishHeartbeat(), HEARTBEAT_INTERVAL_MS);
    connectToRealtimeEdge();
  });

  ws.on('message', (data) => {
    const text = data.toString();
    try {
      const msg = JSON.parse(text);
      if (msg.type === 'command' && msg.from_role !== 'desktop') {
        void executeStructuredCommand(msg, {
          source: 'remote',
          taskId: msg.taskId || null,
          origin: msg.from_role || 'remote',
        });
      }
      if (msg.type === 'desktop_prompt' && msg.from_role !== 'desktop') {
        void queuePromptExecution(msg.text || '', {
          source: 'remote',
          origin: msg.from_role || 'remote',
        });
      }
      // Handle phone approval responses for high-risk commands
      if (msg.type === 'approval_response' && msg.approvalId) {
        const pending = PENDING_APPROVALS.get(msg.approvalId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          PENDING_APPROVALS.delete(msg.approvalId);
          pending.resolve(msg.approved === true);
        }
      }
    } catch (error) {
      emitStatus('warning', error.message);
    }
    emitter.emit('message', text);
  });

  ws.on('close', () => {
    emitStatus('disconnected', 'Retrying in 3 seconds');
    clearInterval(heartbeatTimer);
    reconnectTimer = setTimeout(() => connectToBackend({ token: currentToken }), 3000);
  });

  ws.on('error', (error) => {
    const detail = String(error?.message || '');
    if (/ECONNREFUSED|EHOSTUNREACH|ENOTFOUND/i.test(detail)) {
      emitStatus('disconnected', `Cannot reach backend (${BACKEND_URL}). Local commands still work. Retrying in 3 seconds.`);
      return;
    }
    emitStatus('error', detail || 'WebSocket error');
  });

  return ws;
}

// ── Plugin Extension API ──────────────────────────────────────────────────────
// Drop a .js file into ~/.config/JarvisDesktop/plugins/ (or %APPDATA%/JarvisDesktop/plugins/).
// Each plugin must export: { name: string, description: string, execute: async (msg) => { summary } }
const PLUGINS_DIR = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.config'),
  'JarvisDesktop',
  'plugins',
);

function loadPlugins() {
  const pluginCommands = {};
  try {
    if (!fs.existsSync(PLUGINS_DIR)) {
      fs.mkdirSync(PLUGINS_DIR, { recursive: true });
      return pluginCommands;
    }
    const files = fs.readdirSync(PLUGINS_DIR).filter((f) => f.endsWith('.js'));
    for (const file of files) {
      try {
        const pluginPath = path.join(PLUGINS_DIR, file);
        // Clear require cache so plugins can be hot-reloaded
        delete require.cache[require.resolve(pluginPath)];
        const plugin = require(pluginPath);
        if (plugin && typeof plugin.name === 'string' && typeof plugin.execute === 'function') {
          pluginCommands[plugin.name] = plugin;
          console.log(`[plugins] Loaded: ${plugin.name} — ${plugin.description || '(no description)'}`);
        }
      } catch (err) {
        console.error(`[plugins] Failed to load ${file}:`, err.message);
      }
    }
  } catch {
    // plugin dir not accessible; continue without plugins
  }
  return pluginCommands;
}

const PLUGIN_COMMANDS = loadPlugins();

module.exports = {
  connectToBackend,
  executeStructuredCommand,
  getBackendUrl: () => BACKEND_URL,
  getCurrentToken: () => currentToken,
  getLocalStateSnapshot: () => readState(),
  onMessage: (callback) => emitter.on('message', callback),
  onStatus: (callback) => emitter.on('status', callback),
  pluginsDir: PLUGINS_DIR,
  queuePromptExecution,
  sendMessageToBackend,
};
