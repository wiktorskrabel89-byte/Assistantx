const fs = require('fs');
const WebSocket = require('ws');
const { execFile } = require('child_process');
const EventEmitter = require('events');
const os = require('os');
const path = require('path');
const runtimeConfig = require('./runtime-config');
const { getAccountSession } = require('./accounts');
const {
  appendHistory,
  getFavoriteApp,
  readState,
  rememberFile,
  rememberPrompt,
  saveReminder,
  saveTask,
} = require('./local-state');
const { planPrompt } = require('./task-planner');
const launcherService = require('./launcher/launch-service');
const {
  APP_CLOSE_MAP,
  APP_CLOSE_MAP_DARWIN,
} = require('./app-launch-config');
const { createRuntimeV2, isRuntimeV2Enabled } = require('./electron/runtime');
const { createBackendRuntimeAdapter } = require('./electron/runtime/backend-runtime-adapter');
const { createExecutionSandbox } = require('./electron/sandbox/execution-sandbox');
const { createPromptRegistry } = require('./prompts/registry');
const { createModelCapabilityRegistry } = require('./electron/ai/models/registry');
const { buildTemporalContext } = require('./electron/temporal/context');
const { AiStreamSegmenter, normalizeChunk } = require('./ai-stream-segmenter');

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
const runtimeV2Enabled = isRuntimeV2Enabled();
const promptRegistry = createPromptRegistry();
const modelRegistry = createModelCapabilityRegistry();
const runtimeV2 = runtimeV2Enabled
  ? createRuntimeV2({
    logSink(entry) {
      if (entry.level === 'error') console.error('[runtime-v2]', entry.event, entry.payload || {});
      else if (entry.level === 'warn') console.warn('[runtime-v2]', entry.event, entry.payload || {});
    },
  })
  : null;
if (runtimeV2) {
  runtimeV2.sandbox = createExecutionSandbox();
}
let runtimeV2Adapter = null;
const pendingAiRouteStreams = new Map();
const DEFAULT_BACKEND_URL = '';
const EXPLICIT_BACKEND_URL = (process.env.JARVIS_BACKEND_URL || '').trim();
const BACKEND_URL = EXPLICIT_BACKEND_URL || DEFAULT_BACKEND_URL;
const BACKEND_IS_OPTIONAL = !EXPLICIT_BACKEND_URL;
const REALTIME_EDGE_URL = process.env.JARVIS_REALTIME_URL || '';
const HEARTBEAT_INTERVAL_MS = Number(process.env.JARVIS_HEARTBEAT_INTERVAL_MS || 5000);
const TTS_STREAMING_ENABLED = !/^(0|false|no|off)$/i.test(String(process.env.JARVIS_TTS_STREAMING || 'true'));
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
  'cancelTask',
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
  cancelTask: 'low',
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
let backendDisabledForSession = false;
let currentToken;
let currentSessionId = null;
let currentResumeToken = null;
let taskCounter = 0;
let queueProcessing = false;
const taskQueue = [];

// ── Conversation history ──────────────────────────────────────────────────────
// In-memory ring buffer of the last MAX_CONVERSATION_TURNS messages.
// Shared across all callers of runAiPrompt so the AI retains context.
const MAX_CONVERSATION_TURNS = 10; // 5 user + 5 assistant messages
const conversationHistory = [];
const GEO_CONTEXT_TTL_MS = 15 * 60 * 1000;
let cachedGeoContext = null;
let cachedGeoContextAt = 0;
let geoContextPending = null;

function recordConversationTurn(role, content) {
  conversationHistory.push({ role, content: String(content || '').trim() });
  if (conversationHistory.length > MAX_CONVERSATION_TURNS) {
    conversationHistory.shift();
  }
}

function getConversationHistory() {
  return [...conversationHistory];
}

function toIsoNow() {
  return new Date().toISOString();
}

function getRuntimeLocale() {
  try {
    if (typeof navigator !== 'undefined' && navigator.language) {
      return String(navigator.language).trim();
    }
  } catch {
    // ignore
  }
  return Intl.DateTimeFormat().resolvedOptions().locale;
}

function getRuntimeTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function getPreferredLanguage(locale) {
  return String(locale || 'en').split('-')[0]?.toLowerCase() || 'en';
}

function getCachedGeoContext(nowMs) {
  if (!cachedGeoContext || (nowMs - cachedGeoContextAt) > GEO_CONTEXT_TTL_MS) return null;
  return cachedGeoContext;
}

async function fetchIpGeoContext() {
  const nowMs = Date.now();
  const cached = getCachedGeoContext(nowMs);
  if (cached) return cached;
  if (geoContextPending) return geoContextPending;

  geoContextPending = (async () => {
    if (typeof fetch !== 'function') return null;
    try {
      const response = await fetch('https://ipapi.co/json/', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) return null;
      const payload = await response.json().catch(() => null);
      if (!payload || typeof payload !== 'object') return null;
      const city = String(payload.city || '').trim();
      const region = String(payload.region || '').trim();
      const country = String(payload.country_name || '').trim();
      const countryCode = String(payload.country_code || '').trim().toUpperCase();
      const timezone = String(payload.timezone || '').trim();
      const latitude = Number(payload.latitude);
      const longitude = Number(payload.longitude);
      const languages = String(payload.languages || '').trim();
      const preferredLanguage = languages ? String(languages.split(',')[0] || '').trim().split('-')[0]?.toLowerCase() : null;
      const hasText = city || region || country;
      const hasCoords = Number.isFinite(latitude) && Number.isFinite(longitude);
      if (!hasText && !hasCoords && !timezone) return null;

      return {
        timezone: timezone || null,
        preferredLanguage: preferredLanguage || null,
        location: {
          city: city || null,
          region: region || null,
          country: country || null,
          countryCode: countryCode || null,
          latitude: hasCoords ? latitude : null,
          longitude: hasCoords ? longitude : null,
          source: 'ipapi.co',
        },
      };
    } catch {
      return null;
    }
  })();

  const resolved = await geoContextPending;
  geoContextPending = null;
  cachedGeoContext = resolved;
  cachedGeoContextAt = Date.now();
  return resolved;
}

async function buildAssistantTemporalContext() {
  const locale = getRuntimeLocale();
  const timezone = getRuntimeTimezone();
  const geo = await fetchIpGeoContext();
  return buildTemporalContext({
    locale,
    timezone: geo?.timezone || timezone,
    preferredLanguage: geo?.preferredLanguage || getPreferredLanguage(locale),
    location: geo?.location || null,
  });
}

function emitStatus(status, detail) {
  emitter.emit('status', { status, detail, url: BACKEND_URL });
}

function isSkillsSlashPrompt(prompt) {
  const normalized = String(prompt || '').trim().toLowerCase();
  return normalized === '/skill' || normalized === '/skills';
}

function buildSkillsSlashResponse() {
  return [
    '# Jarvis Skills',
    '',
    'Use `/skills` or `/skill` to open this capability overview.',
    '',
    '## Local desktop commands',
    '- /os, /screenshot, /open <app>, /game <name>, /sleep',
    '- /repo [path], /file <path>, /search <query>, /db <query>, /index, /ignore <pattern>',
    '',
    '## Cloud commands (AssistantX account)',
    '- /today, /calendar <event>, /gmail [filter], /draft <text>, /drive <url|id>',
    '- /web <url>, /google <query>, /slack [#channel]',
  ].join('\n');
}

function emitRawMessage(payload) {
  emitter.emit('message', JSON.stringify(payload));
}

function bindAiRouteStreamingEvents() {
  if (!ipcRenderer || typeof ipcRenderer.on !== 'function') return;
  ipcRenderer.on('jarvis-ai-route-event', (_event, payload) => {
    const streamId = String(payload?.streamId || '').trim();
    if (!streamId) return;
    const state = pendingAiRouteStreams.get(streamId);
    if (!state) return;
    const token = normalizeChunk(String(payload?.token || ''));
    if (!token) return;
    emitRawMessage({
      type: 'ai_stream_token',
      streamId,
      token,
      provider: payload?.provider || state.provider || null,
      model: payload?.model || state.model || null,
    });
    const segments = state.segmenter.pushToken(token);
    for (const segment of segments) {
      state.segmentIndex += 1;
      emitRawMessage({
        type: 'ai_stream_segment',
        streamId,
        segment,
        segmentIndex: state.segmentIndex,
        provider: payload?.provider || state.provider || null,
        model: payload?.model || state.model || null,
      });
    }
  });
}

bindAiRouteStreamingEvents();

function sendMessageToBackend(payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
    return true;
  }
  return false;
}

async function refreshDiscoveredApps(reason = 'manual') {
  const result = await launcherService.refreshCatalog({ reason, platform: PLATFORM });
  return {
    summary: `App catalog refreshed (${result.appCount} discovered apps) via ${result.provider}.`,
    appCount: result.appCount,
    provider: result.provider,
    everythingAvailable: result.everythingAvailable,
    reason,
  };
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

function getLauncherTrigger(context = {}) {
  if (context.source === 'remote') return 'remote';
  if (context.origin === 'sidecar' || context.origin === 'voice' || context.origin === 'browser-voice') return 'voice';
  if (context.taskId || context.origin === 'workflow' || context.origin === 'ai') return 'workflow';
  return 'manual';
}

async function requestLaunchConfirmation(result, approve) {
  if (!result?.confirmation) return result;
  if (!ipcRenderer) {
    throw new Error(result.summary || 'Launch confirmation required.');
  }
  const approved = await ipcRenderer.invoke('request-launcher-confirmation', result.confirmation);
  if (!approved) {
    throw new Error(result.summary || 'Launch confirmation was denied.');
  }
  return approve();
}

function getHttpBaseUrl(url) {
  return String(url || '')
    .replace(/^wss?:\/\//, (match) => (match === 'wss://' ? 'https://' : 'http://'))
    .replace(/\/ws\/?$/, '')
    .replace(/\/$/, '');
}

function getJarvisAiEndpointCandidates() {
  const apiBaseUrl = runtimeConfig.getJarvisApiUrl();
  const webBaseUrl = typeof runtimeConfig.getJarvisWebUrl === 'function'
    ? runtimeConfig.getJarvisWebUrl()
    : apiBaseUrl;
  let alternateAssistantxBaseUrl = null;
  try {
    const parsed = new URL(webBaseUrl);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'assistantx.pl') {
      parsed.hostname = 'www.assistantx.pl';
      alternateAssistantxBaseUrl = parsed.origin;
    } else if (hostname === 'www.assistantx.pl') {
      parsed.hostname = 'assistantx.pl';
      alternateAssistantxBaseUrl = parsed.origin;
    }
  } catch {
    alternateAssistantxBaseUrl = null;
  }

  const candidates = [
    process.env.JARVIS_AI_URL,
    apiBaseUrl ? `${apiBaseUrl}/api/chat` : null,
    alternateAssistantxBaseUrl ? `${alternateAssistantxBaseUrl}/api/chat` : null,
    BACKEND_URL ? `${getHttpBaseUrl(BACKEND_URL)}/chat` : null,
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

function getRuntimeV2Adapter() {
  if (!runtimeV2Enabled || !runtimeV2) return null;
  if (runtimeV2Adapter) return runtimeV2Adapter;
  runtimeV2Adapter = createBackendRuntimeAdapter({
    runtime: runtimeV2,
    planPrompt,
    runAiPrompt,
    executeStructuredCommand,
    publishTaskUpdate,
    saveTask,
    rememberPrompt,
    getFavoriteApp,
  });
  return runtimeV2Adapter;
}

function buildRouteHint(message) {
  const normalized = String(message || '').toLowerCase();
  const choice = modelRegistry.chooseBest({
    requiresTools: true,
    minContext: normalized.length > 1500 ? 64000 : 0,
    prefersLowCost: normalized.length < 260,
    prefersLowLatency: normalized.length < 260,
  });
  return choice || { provider: 'groq', model: 'qwen-2.5-32b-instruct' };
}

function deriveAiProfile(message) {
  const normalized = String(message || '').toLowerCase();
  if (/(?:screenshot|screen shot|what(?:'s| is)? on (?:my |the )?screen|describe (?:my |the )?screen|look at (?:my |the )?screen|co (?:jest|mam) na ekranie|poka[zż].*(?:ekran|widzisz))/i.test(normalized)) {
    return 'vision';
  }
  if (/(code|refactor|debug|typescript|javascript|python|sql|architecture|bug|compile|test)/i.test(normalized)) {
    return 'coding';
  }
  if (/(search|web|tool|browser|memory|retrieve|lookup)/i.test(normalized)) {
    return 'tool';
  }
  return 'chat';
}

async function runAiPrompt(prompt, meta = {}) {
  let lastError = null;
  const session = getAccountSession();
  const accessToken = session?.accessToken;
  const streamId = `ai-stream-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const streamState = {
    streamId,
    segmenter: new AiStreamSegmenter(),
    segmentIndex: 0,
    provider: null,
    model: null,
    done: false,
  };
  if (TTS_STREAMING_ENABLED) {
    pendingAiRouteStreams.set(streamId, streamState);
    emitRawMessage({
      type: 'ai_stream_started',
      streamId,
    });
  }

  // No upfront "not logged in" gate here — the primary route below
  // (ipcRenderer 'jarvis-ai-route', the local 6-lane Model Router → Ollama)
  // never needs accessToken. It's only read further down as an optional
  // Bearer header for the cloud HTTP fallback, which already degrades
  // gracefully (and surfaces its own error) when accessToken is absent.

  // Record the user turn first, then snapshot — the current prompt is included.
  recordConversationTurn('user', prompt);
  const history = getConversationHistory();
  const routeHint = buildRouteHint(prompt);
  const routeProfile = deriveAiProfile(prompt);
  const temporalContext = await buildAssistantTemporalContext();
  const composedPrompt = promptRegistry.composer.compose({
    taskPrompt: String(prompt || ''),
    memoryContext: history.map((item) => `${item.role}: ${item.content}`).join('\n'),
    temporalContext,
  });

  // Signal to the UI that a response is in flight.
  emitRawMessage({ type: 'ai_thinking', inFlight: true });

  if (ipcRenderer?.invoke) {
    try {
      const routed = await ipcRenderer.invoke('jarvis-ai-route', {
        message: composedPrompt,
        messages: history,
        profile: routeProfile,
        contextType: routeProfile === 'coding' ? 'code' : routeProfile === 'tool' ? 'tool' : 'general',
        streamId: TTS_STREAMING_ENABLED ? streamId : '',
      });
      if (routed?.ok && routed?.text) {
        const answer = String(routed.text || '').trim();
        if (answer) {
          streamState.provider = routed.provider || null;
          streamState.model = routed.model || null;
          if (TTS_STREAMING_ENABLED && streamState.segmentIndex === 0) {
            const fallbackSegments = streamState.segmenter.pushToken(answer);
            const finalSegments = fallbackSegments.concat(streamState.segmenter.flush());
            for (const segment of finalSegments) {
              streamState.segmentIndex += 1;
              emitRawMessage({
                type: 'ai_stream_segment',
                streamId,
                segment,
                segmentIndex: streamState.segmentIndex,
                provider: streamState.provider,
                model: streamState.model,
              });
            }
          } else if (TTS_STREAMING_ENABLED) {
            const tailSegments = streamState.segmenter.flush();
            for (const segment of tailSegments) {
              streamState.segmentIndex += 1;
              emitRawMessage({
                type: 'ai_stream_segment',
                streamId,
                segment,
                segmentIndex: streamState.segmentIndex,
                provider: streamState.provider,
                model: streamState.model,
              });
            }
          }
          if (TTS_STREAMING_ENABLED && !streamState.done) {
            streamState.done = true;
            emitRawMessage({
              type: 'ai_stream_done',
              streamId,
              provider: streamState.provider,
              model: streamState.model,
              segments: streamState.segmentIndex,
            });
            pendingAiRouteStreams.delete(streamId);
          }
          recordConversationTurn('assistant', answer);
          runtimeV2?.cache?.set(`prompt:${routed.provider || routeHint.provider}:${routed.model || routeHint.model}:${composedPrompt}`, { text: answer }, 45_000);
          runtimeV2?.metrics?.increment('runtime.tokens.request.count', 1, {
            provider: routed.provider || routeHint.provider,
            model: routed.model || routeHint.model,
          });
          emitRawMessage({ type: 'ai_thinking', inFlight: false });
          return publishResult({
            title: 'Jarvis AI',
            text: answer,
            summary: answer,
            source: meta.source || 'local',
            origin: meta.origin || 'desktop',
            taskId: meta.taskId || null,
            provider: routed.provider || null,
            model: routed.model || null,
            routeProfile,
            routeReason: routed?.route?.reason || null,
            streamId,
            ttsStreaming: Boolean(TTS_STREAMING_ENABLED && streamState.segmentIndex > 0),
          });
        }
      }
      if (routed?.ok === false) {
        lastError = new Error(String(routed.error || 'Main-process AI routing failed.'));
      }
    } catch (error) {
      lastError = error;
    }
  }

  for (const endpoint of getJarvisAiEndpointCandidates()) {
    try {
      const cached = runtimeV2?.cache?.get(`prompt:${routeHint.provider}:${routeHint.model}:${composedPrompt}`);
      if (cached) {
        if (TTS_STREAMING_ENABLED && !streamState.done) {
          const cachedSegments = streamState.segmenter.pushToken(String(cached.text || ''));
          const finalCachedSegments = cachedSegments.concat(streamState.segmenter.flush());
          for (const segment of finalCachedSegments) {
            streamState.segmentIndex += 1;
            emitRawMessage({
              type: 'ai_stream_segment',
              streamId,
              segment,
              segmentIndex: streamState.segmentIndex,
              provider: routeHint.provider,
              model: routeHint.model,
            });
          }
          streamState.done = true;
          emitRawMessage({
            type: 'ai_stream_done',
            streamId,
            provider: routeHint.provider,
            model: routeHint.model,
            segments: streamState.segmentIndex,
            fromCache: true,
          });
          pendingAiRouteStreams.delete(streamId);
        }
        emitRawMessage({ type: 'ai_thinking', inFlight: false });
        return publishResult({
          title: 'Jarvis AI',
          text: cached.text,
          summary: cached.text,
          source: meta.source || 'local',
          origin: meta.origin || 'desktop',
          taskId: meta.taskId || null,
          streamId,
          ttsStreaming: Boolean(TTS_STREAMING_ENABLED && streamState.segmentIndex > 0),
        });
      }

      const chatPayload = {
        message: composedPrompt,
        mode: 'auto',
        history,
        routeHint,
      };
      let response;
      if (ipcRenderer && /^https?:\/\//i.test(endpoint)) {
        let proxyResult;
        try {
          proxyResult = await ipcRenderer.invoke('jarvis-ai-request', {
            endpoint,
            payload: chatPayload,
            token: accessToken,
            timeoutMs: 45_000,
          });
        } catch (error) {
          throw new Error(`AI proxy invocation failed at ${endpoint}: ${error?.message || 'unknown error'}`);
        }
        const proxyHeaders = new Headers(proxyResult?.headers || {});
        response = new Response(proxyResult?.body || '', {
          status: Number(proxyResult?.status ?? 500),
          headers: proxyHeaders,
        });
      } else {
        const headers = { 'Content-Type': 'application/json' };
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
        response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(chatPayload),
          signal: AbortSignal.timeout(45_000),
        });
      }

      if (!response.ok) {
        throw new Error(`AI request failed (${response.status}) at ${endpoint}`);
      }

      const answer = await extractAiResponseText(response);
      if (!answer) {
        throw new Error(`AI endpoint returned an empty response at ${endpoint}`);
      }
      if (TTS_STREAMING_ENABLED && streamState.segmentIndex === 0) {
        const fallbackSegments = streamState.segmenter.pushToken(answer);
        const finalSegments = fallbackSegments.concat(streamState.segmenter.flush());
        for (const segment of finalSegments) {
          streamState.segmentIndex += 1;
          emitRawMessage({
            type: 'ai_stream_segment',
            streamId,
            segment,
            segmentIndex: streamState.segmentIndex,
            provider: routeHint.provider,
            model: routeHint.model,
          });
        }
      }
      if (TTS_STREAMING_ENABLED && !streamState.done) {
        streamState.done = true;
        emitRawMessage({
          type: 'ai_stream_done',
          streamId,
          provider: routeHint.provider,
          model: routeHint.model,
          segments: streamState.segmentIndex,
        });
        pendingAiRouteStreams.delete(streamId);
      }

      // Record the assistant's reply so subsequent turns have full context.
      recordConversationTurn('assistant', answer);
      runtimeV2?.cache?.set(`prompt:${routeHint.provider}:${routeHint.model}:${composedPrompt}`, { text: answer }, 45_000);
      runtimeV2?.metrics?.increment('runtime.tokens.request.count', 1, {
        provider: routeHint.provider,
        model: routeHint.model,
      });
      emitRawMessage({ type: 'ai_thinking', inFlight: false });

      return publishResult({
        title: 'Jarvis AI',
        text: answer,
        summary: answer,
        source: meta.source || 'local',
        origin: meta.origin || 'desktop',
        taskId: meta.taskId || null,
        streamId,
        ttsStreaming: Boolean(TTS_STREAMING_ENABLED && streamState.segmentIndex > 0),
      });
    } catch (error) {
      lastError = error;
    }
  }

  if (TTS_STREAMING_ENABLED && !streamState.done) {
    emitRawMessage({ type: 'ai_stream_done', streamId, error: lastError?.message || 'ai-unavailable' });
    pendingAiRouteStreams.delete(streamId);
  }
  emitRawMessage({ type: 'ai_thinking', inFlight: false });

  return publishResult({
    title: 'AI unavailable',
    text: lastError?.message || 'Jarvis could not reach any AI endpoint.',
    summary: lastError?.message || 'Jarvis could not reach any AI endpoint.',
    level: 'error',
    source: meta.source || 'local',
    origin: meta.origin || 'desktop',
    taskId: meta.taskId || null,
    streamId,
    ttsStreaming: false,
  });
}

async function openUrl(url, options = {}) {
  const nextUrl = normalizeHttpUrl(url);
  const trigger = options.trigger || 'manual';
  const result = await launcherService.launchUrl(nextUrl, {
    trigger,
    confirmed: Boolean(options.confirmed),
  });
  if (result?.status === 'confirmation_required') {
    return requestLaunchConfirmation(result, async () => launcherService.launchUrl(nextUrl, {
      trigger,
      confirmed: true,
    }));
  }
  return result;
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

async function searchWeb(query, options = {}) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) throw new Error('Missing search query.');
  await openUrl(`https://www.google.com/search?q=${encodeURIComponent(normalizedQuery)}`, options);
  return { summary: `Searching the web for: ${normalizedQuery}` };
}

async function searchYouTube(query, options = {}) {
  const normalizedQuery = String(query || '').trim();
  if (!normalizedQuery) throw new Error('Missing YouTube search query.');
  await openUrl(`https://www.youtube.com/results?search_query=${encodeURIComponent(normalizedQuery)}`, options);
  return { summary: `Searching YouTube for: ${normalizedQuery}` };
}

async function openApp(app, options = {}) {
  const rawApp = String(app || '').trim();
  if (!rawApp) throw new Error('Missing app name.');
  const trigger = options.trigger || 'manual';
  let result = await launcherService.launchApp(rawApp, {
    trigger,
    confirmed: Boolean(options.confirmed),
    admin: Boolean(options.admin),
  });
  if (result?.status === 'confirmation_required') {
    return requestLaunchConfirmation(result, async () => launcherService.launchApp(rawApp, {
      trigger,
      confirmed: true,
      admin: Boolean(options.admin),
    }));
  }
  if (result?.status === 'unknown') {
    await refreshDiscoveredApps('open-unknown-fallback');
    result = await launcherService.launchApp(rawApp, {
      trigger,
      confirmed: Boolean(options.confirmed),
      admin: Boolean(options.admin),
    });
  }
  if (result?.status === 'unknown') {
    const lookup = await launcherService.searchApps(rawApp, { limit: 1 });
    const bestMatch = lookup?.results?.[0];
    if (bestMatch?.key) {
      const matchedResult = await launcherService.launchApp(bestMatch.key, {
        trigger,
        confirmed: Boolean(options.confirmed),
        admin: Boolean(options.admin),
      });
      if (matchedResult?.status !== 'unknown') {
        return matchedResult;
      }
    }
    throw new Error(`Unknown app: ${rawApp}.${result.suggestions?.length ? ` Did you mean: ${result.suggestions.map((item) => item.name || item.key).join(', ')}?` : ''}`);
  }
  return result;
}

async function teachAppAlias(alias, app) {
  return launcherService.teachAlias(alias, app);
}

async function closeApp(app) {
  const normalized = String(app || '').trim().toLowerCase();
  if (PLATFORM === 'darwin') {
    const appName = APP_CLOSE_MAP_DARWIN[normalized] || normalized;
    await execFilePromise('osascript', ['-e', `tell application "${appName}" to quit`]);
    return { summary: `Closed ${appName}.`, app: normalized };
  }
  let processName = APP_CLOSE_MAP[normalized];
  if (!processName) {
    processName = await findRunningProcessForApp(normalized);
  }
  if (!processName) throw new Error(`Unknown app: ${app}. Supported for close: ${Object.keys(APP_CLOSE_MAP).join(', ')}`);
  await execFilePromise('taskkill.exe', ['/IM', processName, '/F']);
  return { summary: `Closed ${normalized}.`, app: normalized };
}

function normalizeProcessName(value) {
  const process = String(value || '').trim();
  if (!process) return '';
  return process.toLowerCase().endsWith('.exe') ? process : `${process}.exe`;
}

async function findRunningProcessForApp(app) {
  if (PLATFORM !== 'win32') return null;
  const query = String(app || '').trim().replace(/\.exe$/i, '').toLowerCase();
  if (!query) return null;
  try {
    const output = await execFilePromise('powershell.exe', ['-NoProfile', '-Command', 'Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName']);
    const processes = String(output || '')
      .split(/\r?\n/)
      .map((value) => value.trim())
      .filter(Boolean);
    const normalizedQuery = query.toLowerCase();
    const exactMatch = processes.find((value) => value.toLowerCase() === normalizedQuery);
    const prefixMatch = processes.find((value) => value.toLowerCase().startsWith(`${normalizedQuery}-`))
      || processes.find((value) => value.toLowerCase().startsWith(`${normalizedQuery}_`));
    const process = exactMatch || prefixMatch || null;
    return normalizeProcessName(process);
  } catch {
    return null;
  }
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
    const launcherTrigger = getLauncherTrigger(context);
    switch (command) {
      case 'openApp':
        result = await openApp(appName || msg.appName || '', {
          source: context.source || 'local',
          origin: context.origin || 'desktop',
          trigger: launcherTrigger,
          admin: Boolean(msg.admin || msg.runAsAdmin),
          confirmed: Boolean(msg.confirmed),
        });
        break;
      case 'cancelTask': {
        if (!runtimeV2Enabled) {
          result = { summary: 'Runtime v2 is disabled; no task cancellation adapter active.' };
          break;
        }
        const adapter = getRuntimeV2Adapter();
        const cancellationResult = adapter?.interruptTask?.(msg.taskId || context.taskId, 'command-cancel');
        result = { summary: cancellationResult?.ok ? `Cancelled task ${cancellationResult.taskId}` : 'Task cancellation failed.' };
        break;
      }
      case 'closeApp':
        result = await closeApp(appName || '');
        break;
      case 'setAppAlias':
        result = await teachAppAlias(msg.alias, msg.app || appName || '');
        break;
      case 'refreshAppCatalog':
        result = await refreshDiscoveredApps('manual-command');
        break;
      case 'openUrl':
        result = await openUrl(url || appName || '', {
          trigger: launcherTrigger,
          confirmed: Boolean(msg.confirmed),
        });
        break;
      case 'openChromeTab':
        result = await openChromeTab(url || appName || '');
        break;
      case 'searchWeb':
        result = await searchWeb(query || text || '', { trigger: launcherTrigger, confirmed: Boolean(msg.confirmed) });
        break;
      case 'searchYouTube':
        result = await searchYouTube(query || text || '', { trigger: launcherTrigger, confirmed: Boolean(msg.confirmed) });
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
      case 'startMode': {
        const mode = String(msg.mode || '').toLowerCase();
        const MODE_APP_MAP = {
          gaming: ['steam', 'discord'],
          study: ['vscode', 'chrome'],
          stream: ['obs', 'discord'],
        };
        const appsToOpen = MODE_APP_MAP[mode] || [];
        const modeResults = [];
        for (const modeApp of appsToOpen) {
          try {
            const modeResult = await openApp(modeApp, { source: context.source || 'local' });
            modeResults.push(modeResult.summary || modeApp);
          } catch (modeErr) {
            modeResults.push(`${modeApp}: ${modeErr.message}`);
          }
        }
        result = {
          summary: mode
            ? `${mode.charAt(0).toUpperCase() + mode.slice(1)} mode started. ${modeResults.join('; ')}`
            : 'Unknown mode.',
        };
        break;
      }
      case 'addReminder': {
        const temporal = msg.temporal && typeof msg.temporal === 'object' ? msg.temporal : null;
        const triggerAt = temporal?.triggerAt || msg.triggerAt || null;
        if (!triggerAt) throw new Error('Reminder requires triggerAt.');
        const saved = saveReminder({
          label: msg.label || msg.text || 'Reminder',
          text: msg.text || msg.label || '',
          triggerAt,
          priority: msg.priority,
          voiceEnabled: msg.voiceEnabled !== false,
          source: context.origin || context.source || 'desktop',
        });
        const latest = Array.isArray(saved.reminders) ? saved.reminders.find((item) => item.triggerAt === triggerAt) : null;
        const when = latest?.triggerAt ? new Date(latest.triggerAt).toLocaleString() : triggerAt;
        result = { summary: `Reminder saved for ${when}.` };
        break;
      }
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

  if (isSkillsSlashPrompt(prompt)) {
    respond(buildSkillsSlashResponse(), {
      title: 'Jarvis Skills',
      source: meta.source || 'local',
      origin: meta.origin || 'desktop',
    });
    return null;
  }

  if (runtimeV2Enabled) {
    const adapter = getRuntimeV2Adapter();
    if (adapter) {
      const taskId = `rt-queued-${Date.now()}-${++taskCounter}`;
      void adapter.executePrompt(prompt, meta).catch((error) => {
        publishResult({
          title: 'Runtime v2 failed',
          text: error?.message || 'Runtime v2 execution failed.',
          summary: error?.message || 'Runtime v2 execution failed.',
          level: 'error',
          source: meta.source || 'local',
          origin: meta.origin || 'desktop',
          taskId,
        });
      });
      return taskId;
    }
  }

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

  if (backendDisabledForSession) {
    emitStatus('ready', 'Remote backend is unavailable, running in local-only mode for this session.');
    return null;
  }

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
    if (backendDisabledForSession) return;
    emitStatus('disconnected', 'Retrying in 3 seconds');
    clearInterval(heartbeatTimer);
    reconnectTimer = setTimeout(() => connectToBackend({ token: currentToken }), 3000);
  });

  ws.on('error', (error) => {
    const detail = String(error?.message || '');
    if (/ECONNREFUSED|EHOSTUNREACH|ENOTFOUND/i.test(detail)) {
      if (BACKEND_IS_OPTIONAL) {
        backendDisabledForSession = true;
        clearTimeout(reconnectTimer);
        clearInterval(heartbeatTimer);
        ws = null;
        emitStatus('ready', `Cannot reach backend (${BACKEND_URL}). Switched to local-only mode for this session.`);
        return;
      }
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
  } catch (err) {
    console.warn('[plugins] Plugin directory not accessible:', err?.message || err);
  }
  return pluginCommands;
}

const PLUGIN_COMMANDS = loadPlugins();

if (PLATFORM === 'win32') {
  setTimeout(() => {
    void refreshDiscoveredApps('startup');
  }, 500);
}

if (runtimeV2Enabled) {
  try {
    const adapter = getRuntimeV2Adapter();
    const resumable = adapter?.resumePersistedWorkflows?.() || [];
    for (const workflow of resumable) {
      emitRawMessage({
        type: 'task_update',
        taskId: workflow.id,
        status: 'rehydrated',
        summary: workflow.prompt || 'Recovered workflow',
      });
    }
  } catch (error) {
    emitRawMessage({
      type: 'command_result',
      level: 'warning',
      title: 'Runtime v2',
      summary: `Failed to rehydrate workflows: ${error?.message || 'unknown error'}`,
    });
  }
}

module.exports = {
  connectToBackend,
  executeStructuredCommand,
  getBackendUrl: () => BACKEND_URL,
  getJarvisAiEndpointCandidates,
  getCurrentToken: () => currentToken,
  getLocalStateSnapshot: () => readState(),
  onMessage: (callback) => emitter.on('message', callback),
  onStatus: (callback) => emitter.on('status', callback),
  pluginsDir: PLUGINS_DIR,
  queuePromptExecution,
  sendMessageToBackend,
  isRuntimeV2Enabled: () => runtimeV2Enabled,
};
