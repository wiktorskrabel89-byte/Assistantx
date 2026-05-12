const fs = require('fs');
const WebSocket = require('ws');
const { execFile } = require('child_process');
const EventEmitter = require('events');
const os = require('os');
const path = require('path');
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
try {
  ipcRenderer = require('electron').ipcRenderer;
} catch {
  ipcRenderer = null;
}

const emitter = new EventEmitter();
const BACKEND_URL = process.env.JARVIS_BACKEND_URL || 'ws://127.0.0.1:8000/ws';
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
]);

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

function buildPresencePayload() {
  return {
    status: queueProcessing ? 'busy' : 'online',
    activeApps: [],
    cpu: null,
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

function publishHeartbeat() {
  const presence = buildPresencePayload();
  const heartbeatPayload = {
    type: 'device_status',
    role: 'desktop',
    status: presence.status,
    activeApps: presence.activeApps,
    cpu: presence.cpu,
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
  const normalized = String(app || '').trim().toLowerCase();
  const target = APP_OPEN_MAP[normalized];
  if (!target) throw new Error(`Unknown app: ${app}. Supported: ${Object.keys(APP_OPEN_MAP).join(', ')}`);
  await execFilePromise('cmd.exe', ['/c', 'start', '', target]);
  rememberApp(normalized);
  return { summary: `Opened ${normalized}.`, app: normalized };
}

async function closeApp(app) {
  const normalized = String(app || '').trim().toLowerCase();
  const processName = APP_CLOSE_MAP[normalized];
  if (!processName) throw new Error(`Unknown app: ${app}. Supported for close: ${Object.keys(APP_CLOSE_MAP).join(', ')}`);
  await execFilePromise('taskkill.exe', ['/IM', processName, '/F']);
  return { summary: `Closed ${normalized}.`, app: normalized };
}

async function takeScreenshot() {
  const ts = Date.now();
  const screenshotPath = path.join(USER_HOME, 'Desktop', `jarvis_screenshot_${ts}.png`);
  const escapedPath = screenshotPath.replace(/'/g, "''");
  const psCmd = [
    'Add-Type -AssemblyName System.Windows.Forms',
    'Add-Type -AssemblyName System.Drawing',
    '$b = New-Object System.Drawing.Bitmap([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width,[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height)',
    '$g = [System.Drawing.Graphics]::FromImage($b)',
    '$g.CopyFromScreen(0,0,0,0,$b.Size)',
    `$b.Save('${escapedPath}')`,
    '$g.Dispose()',
    '$b.Dispose()',
  ].join('; ');
  await execFilePromise('powershell.exe', ['-NoProfile', '-Command', psCmd]);
  const imageDataUrl = `data:image/png;base64,${(await fs.promises.readFile(screenshotPath)).toString('base64')}`;
  if (ipcRenderer) {
    void ipcRenderer.invoke('open-path', path.dirname(screenshotPath));
  }
  rememberFile(screenshotPath);
  return {
    summary: `Screenshot captured: ${path.basename(screenshotPath)}`,
    imageDataUrl,
    path: screenshotPath,
    title: 'Screenshot ready',
  };
}

async function getSystemInfo() {
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

async function typeText(text) {
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
        await execFilePromise('nircmd.exe', ['changesysvolume', '6554']);
        result = { summary: 'Volume increased.' };
        break;
      case 'volumeDown':
        await execFilePromise('nircmd.exe', ['changesysvolume', '-6554']);
        result = { summary: 'Volume decreased.' };
        break;
      case 'mute':
        await execFilePromise('nircmd.exe', ['mutesysvolume', '2']);
        result = { summary: 'Mute toggled.' };
        break;
      case 'setVolume':
        result = await setVolume(level);
        break;
      case 'screenshot':
        result = await takeScreenshot();
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
      case 'lockScreen':
        await execFilePromise('rundll32.exe', ['user32.dll,LockWorkStation']);
        result = { summary: 'Screen locked.' };
        break;
      case 'shutdown':
        await execFilePromise('shutdown.exe', ['/s', '/t', '30']);
        result = { summary: 'Shutdown scheduled in 30 seconds.' };
        break;
      case 'restart':
        await execFilePromise('shutdown.exe', ['/r', '/t', '30']);
        result = { summary: 'Restart scheduled in 30 seconds.' };
        break;
      case 'sleep':
        await execFilePromise('rundll32.exe', ['powrprof.dll,SetSuspendState', '0,1,0']);
        result = { summary: 'Sleep requested.' };
        break;
      case 'cancelShutdown':
        await execFilePromise('shutdown.exe', ['/a']);
        result = { summary: 'Shutdown/restart cancelled.' };
        break;
      default:
        throw new Error(`Unknown command: ${command}`);
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
    return respond(`I could not map this prompt to a safe desktop action: ${prompt}`, {
      title: 'No action detected',
      level: 'warning',
      source: meta.source || 'local',
    });
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
    publishHeartbeat();
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

  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return ws;
  }

  clearTimeout(reconnectTimer);
  emitStatus('connecting');
  ws = new WebSocket(BACKEND_URL);

  ws.on('open', () => {
    emitStatus('connected');
    sendMessageToBackend({ type: 'register', role: 'desktop', token: currentToken });
    publishHeartbeat();
    clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => publishHeartbeat(), HEARTBEAT_INTERVAL_MS);
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
    emitStatus('error', error.message);
  });

  return ws;
}

module.exports = {
  connectToBackend,
  executeStructuredCommand,
  getBackendUrl: () => BACKEND_URL,
  getCurrentToken: () => currentToken,
  getLocalStateSnapshot: () => readState(),
  onMessage: (callback) => emitter.on('message', callback),
  onStatus: (callback) => emitter.on('status', callback),
  queuePromptExecution,
  sendMessageToBackend,
};
