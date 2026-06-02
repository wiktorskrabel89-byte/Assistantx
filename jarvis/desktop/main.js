const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, globalShortcut, ipcMain, shell, Tray, Menu, nativeImage, autoUpdater: nativeAutoUpdater } = require('electron');
const {
  getEngineMode,
  getJarvisModelConfig,
  getJarvisWebUrl,
  setJarvisWebUrl,
} = require('./runtime-config');
const { createServerBridge } = require('./electron/server/bridge');
const { getToken: getDeviceToken } = require('./auth');
const {
  getAccountProfile,
  getSafeAccountSession,
  loadAccountSession,
  refreshSessionIfNeeded,
  setAccountSession,
  signOutAccountSession,
} = require('./accounts');
const { execFile, spawn } = require('child_process');
const launcherService = require('./launcher/launch-service');
const launcherDb = require('./launcher/db');
const { createStartupDiagnostics } = require('./services/startup-diagnostics');
const { createEventBus } = require('./telemetry/event-bus');
const { getLocalTelemetrySnapshot, wireLocalTelemetry } = require('./telemetry/local-telemetry');
const { buildSecureWebPreferences } = require('./electron/main/window-security');
const { createMainIpcHandlers } = require('./electron/ipc/register-main-handlers');
const { createUpdateCoordinator } = require('./electron/updater/coordinator');
const { createPermissionPolicy } = require('./electron/permissions/policy');
const { assertNoDynamicCodeExecution, sanitizeAuditValue } = require('./electron/security/guardrails');
const { emitSessionChanged } = require('./electron/auth/events');
const { redactUrl } = require('./electron/auth/redaction');
const { bindAuthEvents } = require('./electron/auth/sync');
const { generateOAuthState, parseAuthCallback, toSafeSessionView } = require('./electron/auth/validators');
const { createGitHubClient } = require('./electron/tools/github');
const { createGoogleClient } = require('./electron/tools/google');
const appsTool = require('./electron/tools/apps');
const { createFilesystemTools } = require('./electron/tools/filesystem');
const { createBrowserTools } = require('./electron/tools/browser');
const { createMemoryTools } = require('./electron/tools/memory');
const { createOperatingSystemTools } = require('./electron/tools/os');
const { createMCPServerManager } = require('./electron/mcp/server-manager');
const { createMCPToolRouter } = require('./electron/mcp/tool-router');
const { AIRouter } = require('./electron/ai/router');
const { createLocalServerStore } = require('./electron/ai/local-server-store');

// ── DB readiness helper ───────────────────────────────────────────────────────
// Ensures the launcher SQLite database is initialised before any IPC handler
// that touches it.  Concurrent callers share the same in-flight promise thanks
// to the deduplication logic inside db.init().
function ensureDbReady() {
  return launcherDb.init();
}

function normalizeSidecarEngineMode(engineMode) {
  return String(engineMode || '').trim().toLowerCase() === 'byok-cloud' ? 'cloud' : 'local';
}

function normalizeSidecarSttModel(model) {
  const value = String(model || '').trim().toLowerCase();
  if (value === 'whisper-large-v3' || value === 'whisper-large-v3-turbo') return 'large';
  if (value === 'whisper-medium') return 'medium';
  if (value === 'whisper-small') return 'small';
  if (value === 'whisper-tiny') return 'tiny';
  if (value === 'whisper-base') return 'base';
  return value || 'base';
}

function normalizeSidecarTtsBackend(model) {
  const value = String(model || '').trim().toLowerCase();
  if (value === 'piper' || value === 'piper-local') return 'piper';
  if (value === 'auto' || value === 'auto-local') return 'auto';
  return 'kokoro';
}

function resetLocalVoiceAssetsState() {
  localVoiceAssetsState = {
    started: false,
    complete: false,
    percent: 0,
    status: 'Preparing local voice assets…',
  };
}

function getSplashVoiceStatusLabel(phase, fallback) {
  if (phase === 'downloading_stt') return fallback || 'Downloading Whisper speech model…';
  if (phase === 'downloading_tts') return fallback || 'Downloading Kokoro voice model…';
  if (phase === 'downloading_tts_piper') return fallback || 'Downloading Piper fallback voice…';
  if (phase === 'model_download_complete') return fallback || 'Local voice assets ready.';
  return fallback || 'Preparing local voice assets…';
}

function handleSidecarStatusPayload(payload) {
  if (!payload || payload.type !== 'status') return;
  const phase = String(payload.phase || '').trim().toLowerCase();
  if (!phase) return;
  if (!['downloading_stt', 'downloading_tts', 'downloading_tts_piper', 'model_download_complete'].includes(phase)) {
    return;
  }
  const percent = phase === 'model_download_complete'
    ? 100
    : Math.max(0, Math.min(100, Number(payload.percent || 0)));
  localVoiceAssetsState = {
    started: true,
    complete: phase === 'model_download_complete',
    percent,
    status: getSplashVoiceStatusLabel(phase, String(payload.status || '').trim()),
  };
  sendToRenderer('splash:progress', {
    pyPercent: localVoiceAssetsState.percent,
    status: localVoiceAssetsState.status,
  });
}

// ── Python AI-Agent sidecar process management ───────────────────────────────
let sidecarProcess = null;
let sidecarStatus = 'idle';
let sidecarHeartbeatInFlight = false;
let sidecarStdoutBuffer = '';
let sidecarReady = false;
let localVoiceAssetsState = {
  started: false,
  complete: false,
  percent: 0,
  status: 'Preparing local voice assets…',
};
const SIDECAR_PORT = process.env.JARVIS_SIDECAR_PORT || '8765';
const SIDECAR_HEALTH_TIMEOUT_MS = Number(process.env.JARVIS_SIDECAR_HEALTH_TIMEOUT_MS || 5000);
const SIDECAR_HEALTH_RETRIES = Math.max(1, Number(process.env.JARVIS_SIDECAR_HEALTH_RETRIES || 3));
const startupDiagnostics = createStartupDiagnostics();
const localServerStore = createLocalServerStore();
const aiRouter = new AIRouter({
  getLocalServerConfig: () => localServerStore.getRouterConfig(),
});
const telemetryBus = createEventBus();
wireLocalTelemetry(telemetryBus);
const serverBridge = createServerBridge();
const githubClient = createGitHubClient({ app });
const googleClient = createGoogleClient({ app });
const mcpManager = createMCPServerManager({ googleClient, githubClient, app });
const permissions = createPermissionPolicy({
  onAudit(entry) {
    startupDiagnostics.pushEvent('permissions', 'info', 'Permission policy decision.', entry);
  },
});

function securityAudit(entry = {}) {
  startupDiagnostics.pushEvent('security', 'info', 'Security audit event.', {
    action: sanitizeAuditValue(entry.action, 120),
    target: sanitizeAuditValue(entry.target, 500),
    at: entry.at || new Date().toISOString(),
  });
}

const nativeFilesystemTools = createFilesystemTools({ rootPath: app.getPath('home') });
const nativeBrowserTools = createBrowserTools();
const nativeMemoryTools = createMemoryTools({ app });
const nativeOperatingSystemTools = createOperatingSystemTools({
  app,
  shell,
  appsTool,
  permissions,
  securityAudit,
});
const mcpRouter = createMCPToolRouter({
  serverManager: mcpManager,
  nativeTools: {
    filesystem: nativeFilesystemTools,
    fetch: nativeBrowserTools,
    memory: nativeMemoryTools,
    'operating-system': nativeOperatingSystemTools,
  },
});

assertNoDynamicCodeExecution('main-process-guardrails', 'main.js bootstrap');

const AUTH_PROTOCOL = 'assistantx';
const AUTH_CALLBACK_URL = `${AUTH_PROTOCOL}://auth/callback`;
const SILENT_REFRESH_INTERVAL_MS = 5 * 60_000;
const AUTH_LOGIN_TIMEOUT_MS = 5 * 60_000;
const AUTH_LOG_FILE_NAME = 'auth.log';

function formatLogArg(arg) {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.stack || arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function appendAuthLog(level, args) {
  try {
    const userDataPath = app.getPath('userData');
    fs.mkdirSync(userDataPath, { recursive: true });
    const line = `[${new Date().toISOString()}] [${level}] ${args.map(formatLogArg).join(' ')}\n`;
    fs.appendFileSync(path.join(userDataPath, AUTH_LOG_FILE_NAME), line);
  } catch {
    // never crash app on logging failure
  }
}

function log(...args) {
  console.log(...args);
  appendAuthLog('info', args);
}

const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

if (process.defaultApp) {
  const appEntry = process.argv[1] ? [path.resolve(process.argv[1])] : [];
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL, process.execPath, appEntry);
} else {
  app.setAsDefaultProtocolClient(AUTH_PROTOCOL);
}

function getSidecarMainPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'ai-agent', 'main.py');
  }
  return path.join(__dirname, '..', '..', 'ai-agent', 'main.py');
}

function getSetupScriptPath() {
  return path.join(__dirname, 'scripts', 'setup-env.ps1');
}

function resolvePythonExecutable() {
  const sidecarDir = path.dirname(getSidecarMainPath());
  log('[sidecar] Resolving python executable for platform:', process.platform, 'packaged:', app.isPackaged);
  const packagedCandidates = [
    // Embedded runtime candidates for packaged Windows builds.
    path.join(process.resourcesPath || '', 'python', 'python.exe'),
    path.join(process.resourcesPath || '', 'ai-agent', 'runtime', 'python', 'python.exe'),
    path.join(sidecarDir, 'venv', 'Scripts', 'python.exe'),
    path.join(sidecarDir, 'venv', 'bin', 'python'),
    // System Python fallback (used when no embedded runtime is bundled).
    'python3',
    'python',
  ];
  const devCandidates = [
    path.join(__dirname, 'python', 'python.exe'),
    ...packagedCandidates,
    'python',
    'python3',
  ];
  const candidates = app.isPackaged ? packagedCandidates : devCandidates;
  const candidateDetails = candidates.map((candidate) => {
    const isPath = candidate.includes(path.sep);
    const exists = isPath ? fs.existsSync(candidate) : null;
    return { candidate, exists };
  });
  for (const entry of candidateDetails) {
    log('[sidecar] Python path candidate:', entry.candidate, 'exists:', entry.exists);
    if (entry.exists === false) continue;
    console.log('[sidecar] Resolved python path:', entry.candidate);
    console.log('[sidecar] Exists:', entry.exists);
    return {
      python: entry.candidate,
      candidates,
      candidateDetails,
    };
  }
  console.log('[sidecar] Resolved python path:', null);
  console.log('[sidecar] Exists:', false);
  return { python: null, candidates, candidateDetails };
}

function setLauncherPhase(phase, detail, details = {}) {
  startupDiagnostics.setPhase('launcher', phase, detail, details);
}

async function fetchSidecarHealth(timeoutMs = SIDECAR_HEALTH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`http://127.0.0.1:${SIDECAR_PORT}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`Health endpoint returned ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function waitForSidecarHeartbeat() {
  const startedAt = Date.now();
  let lastError = null;
  for (let attempt = 1; attempt <= SIDECAR_HEALTH_RETRIES; attempt += 1) {
    try {
      const payload = await fetchSidecarHealth();
      return {
        ok: true,
        payload,
        startupTimeMs: Date.now() - startedAt,
      };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }
  return {
    ok: false,
    reason: lastError?.name === 'AbortError' ? 'health_timeout' : 'health_unreachable',
    error: String(lastError?.message || lastError || 'unknown_error'),
    startupTimeMs: Date.now() - startedAt,
  };
}

function markSidecarListeningForHeartbeat() {
  if (sidecarHeartbeatInFlight) return;
  sidecarHeartbeatInFlight = true;
  setLauncherPhase('starting-api', 'AI runtime API started. Waiting for heartbeat.');
  startupDiagnostics.setComponent('sidecar', 'starting', {
    detail: 'AI runtime started. Waiting for heartbeat.',
    reason: 'waiting_for_heartbeat',
    phase: 'waiting-for-heartbeat',
  });
  void waitForSidecarHeartbeat().then((health) => {
    sidecarHeartbeatInFlight = false;
    if (!sidecarProcess) return;
    if (health.ok) {
      startupDiagnostics.setComponent('sidecar', 'healthy', {
        detail: 'AI runtime healthy and ready.',
        reason: 'heartbeat_ok',
        details: { startupTimeMs: health.startupTimeMs, ...(health.payload || {}) },
        phase: 'healthy',
      });
      startupDiagnostics.setComponent('launcher', 'healthy', {
        detail: 'Launcher initialized AI runtime successfully.',
        reason: 'sidecar_healthy',
        details: { startupTimeMs: health.startupTimeMs },
        phase: 'healthy',
      });
      startupDiagnostics.pushEvent('sidecar', 'info', 'Sidecar heartbeat is healthy.', {
        startupTimeMs: health.startupTimeMs,
      });
      telemetryBus.publish('sidecar.running');
      telemetryBus.publish('startup.healthy');
    } else {
      startupDiagnostics.setComponent('sidecar', 'degraded', {
        detail: 'AI runtime heartbeat failed.',
        reason: health.reason,
        details: {
          startupTimeMs: health.startupTimeMs,
          error: health.error,
        },
        phase: 'waiting-for-heartbeat',
      });
      startupDiagnostics.setComponent('launcher', 'degraded', {
        detail: 'Launcher started sidecar but heartbeat failed.',
        reason: health.reason,
        details: {
          startupTimeMs: health.startupTimeMs,
          error: health.error,
        },
        phase: 'waiting-for-heartbeat',
      });
      startupDiagnostics.pushEvent('sidecar', 'warn', 'Sidecar heartbeat degraded.', {
        reason: health.reason,
        error: health.error,
        startupTimeMs: health.startupTimeMs,
      });
      telemetryBus.publish('startup.degraded');
    }
    emitDesktopHealth();
  });
}

function markSidecarReady(details = {}) {
  if (sidecarReady || !sidecarProcess) return;
  sidecarReady = true;
  sidecarStatus = 'running';
  startupDiagnostics.setComponent('sidecar', 'healthy', {
    detail: 'AI runtime stdio bridge is ready.',
    reason: 'stdio_ready',
    details,
    phase: 'healthy',
  });
  startupDiagnostics.setComponent('launcher', 'healthy', {
    detail: 'Launcher initialized AI runtime successfully.',
    reason: 'sidecar_ready',
    details,
    phase: 'healthy',
  });
  startupDiagnostics.pushEvent('sidecar', 'info', 'Sidecar stdio bridge is healthy.', details);
  telemetryBus.publish('sidecar.running');
  telemetryBus.publish('startup.healthy');
  emitDesktopHealth();
  sendToRenderer('sidecar-status', { status: sidecarStatus });
}

function handleSidecarStdoutLine(line) {
  if (!line) return;
  let payload = null;
  try {
    payload = JSON.parse(line);
  } catch {
    log(`[sidecar] ${line}`);
    return;
  }
  markSidecarReady({ messageType: payload?.type || 'unknown' });
  handleSidecarStatusPayload(payload);
  sendToRenderer('sidecar-message', payload);
}

function sendSidecarMessage(payload) {
  if (!sidecarProcess?.stdin || sidecarProcess.killed) {
    return { ok: false, error: 'sidecar-not-running' };
  }
  try {
    sidecarProcess.stdin.write(`${JSON.stringify(payload)}\n`);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'sidecar-write-failed',
    };
  }
}

function startSidecar() {
  const mainPy = getSidecarMainPath();
  setLauncherPhase('validating-runtime', 'Validating AI runtime paths.');
  if (!fs.existsSync(mainPy)) {
    sidecarStatus = 'unavailable';
    startupDiagnostics.setComponent('sidecar', 'unavailable', {
      detail: 'AI runtime executable not found.',
      reason: 'main_py_missing',
      details: { mainPy },
    });
    startupDiagnostics.setComponent('launcher', 'degraded', {
      detail: 'Launcher cannot locate sidecar runtime.',
      reason: 'runtime_path_missing',
      details: { mainPy },
      phase: 'validating-runtime',
    });
    startupDiagnostics.pushEvent('sidecar', 'warn', 'Sidecar unavailable: main.py missing.');
    telemetryBus.publish('sidecar.unavailable');
    telemetryBus.publish('startup.unavailable');
    emitDesktopHealth();
    return;
  }

  const { python, candidates: pythonCandidates, candidateDetails: pythonCandidateDetails } = resolvePythonExecutable();
  if (!python) {
    sidecarStatus = 'unavailable';
    startupDiagnostics.setComponent('sidecar', 'unavailable', {
      detail: 'AI runtime Python executable not found.',
      reason: 'python_missing',
      details: { mainPy, pythonCandidates, pythonCandidateDetails },
      phase: 'validating-runtime',
    });
    startupDiagnostics.setComponent('launcher', 'degraded', {
      detail: 'Launcher cannot locate AI runtime Python executable.',
      reason: 'python_missing',
      details: { mainPy, pythonCandidates, pythonCandidateDetails },
      phase: 'validating-runtime',
    });
    startupDiagnostics.pushEvent('sidecar', 'warn', 'Sidecar unavailable: Python runtime missing.', {
      mainPy,
      pythonCandidates,
      pythonCandidateDetails,
    });
    telemetryBus.publish('sidecar.unavailable');
    telemetryBus.publish('startup.unavailable');
    emitDesktopHealth();
    return;
  }

  setLauncherPhase('creating-venv', 'Detecting Python runtime environment.', { python });
  setLauncherPhase('loading-models', 'Loading AI runtime models.');
  telemetryBus.publish('sidecar.started');
  startupDiagnostics.setComponent('sidecar', 'starting', {
    detail: 'Starting AI runtime process.',
    reason: 'process_starting',
    details: { python },
    phase: 'starting-api',
  });
  startupDiagnostics.pushEvent('sidecar', 'info', 'Starting sidecar process.', { python });
  telemetryBus.publish('startup.starting');
  emitDesktopHealth();
  sidecarHeartbeatInFlight = false;
  sidecarReady = false;
  sidecarStdoutBuffer = '';
  resetLocalVoiceAssetsState();
  const modelConfig = getJarvisModelConfig();
  const sidecarArgs = [mainPy, '--mode', 'stdio'];
  log('[sidecar] Launching sidecar:', python);
  log('[sidecar] Args:', sidecarArgs);
  sidecarProcess = spawn(python, sidecarArgs, {
    cwd: path.dirname(mainPy),
    env: {
      ...process.env,
      JARVIS_ENGINE_MODE: normalizeSidecarEngineMode(modelConfig.engine_mode),
      JARVIS_STT_MODEL: normalizeSidecarSttModel(modelConfig.stt_model),
      JARVIS_WHISPER_MODEL: normalizeSidecarSttModel(modelConfig.stt_model),
      JARVIS_LANGUAGE: String(modelConfig.language || 'en').trim() || 'en',
      JARVIS_TTS_BACKEND: normalizeSidecarTtsBackend(modelConfig.tts_model),
    },
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  sidecarStatus = 'starting';
  markSidecarListeningForHeartbeat();

  sidecarProcess.stdout?.on('data', (data) => {
    sidecarStdoutBuffer += data.toString();
    const lines = sidecarStdoutBuffer.split(/\r?\n/);
    sidecarStdoutBuffer = lines.pop() ?? '';
    lines.forEach(handleSidecarStdoutLine);
  });

  sidecarProcess.stderr?.on('data', (data) => {
    const line = data.toString().trim();
    if (line) console.error(`[sidecar:err] ${line}`);
    if (/reconnect|retry|re-?connect/i.test(line)) {
      telemetryBus.publish('sidecar.reconnect');
    }
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.on('exit', (code, signal) => {
    log(`[sidecar] process exited: code=${code} signal=${signal}`);
    sidecarProcess = null;
    sidecarHeartbeatInFlight = false;
    sidecarReady = false;
    sidecarStdoutBuffer = '';
    sidecarStatus = 'stopped';
    startupDiagnostics.setComponent('sidecar', code && code !== 0 ? 'crashed' : 'stopped', {
      detail: `AI runtime stopped (code=${code} signal=${signal}).`,
      reason: code && code !== 0 ? 'sidecar_crash' : 'sidecar_stopped',
      details: { code, signal },
      phase: 'stopped',
    });
    startupDiagnostics.setComponent('launcher', 'degraded', {
      detail: 'Launcher detected sidecar stop.',
      reason: 'sidecar_stopped',
      details: { code, signal },
      phase: 'waiting-for-heartbeat',
    });
    startupDiagnostics.pushEvent('sidecar', 'warn', 'Sidecar process exited.', { code, signal });
    telemetryBus.publish('sidecar.exit');
    telemetryBus.publish('startup.degraded');
    emitDesktopHealth();
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.on('error', (err) => {
    console.error('[sidecar] spawn error:', err.message);
    sidecarStatus = 'error';
    sidecarHeartbeatInFlight = false;
    sidecarReady = false;
    startupDiagnostics.setComponent('sidecar', 'unavailable', {
      detail: `AI runtime spawn error: ${err.message}`,
      reason: 'spawn_error',
      details: { error: err.message },
      phase: 'starting-api',
    });
    startupDiagnostics.setComponent('launcher', 'degraded', {
      detail: 'Launcher failed to spawn AI runtime.',
      reason: 'spawn_error',
      details: { error: err.message },
      phase: 'starting-api',
    });
    startupDiagnostics.pushEvent('sidecar', 'error', 'Sidecar spawn error.', { message: err.message });
    telemetryBus.publish('sidecar.error');
    telemetryBus.publish('startup.unavailable');
    emitDesktopHealth();
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });
}

function stopSidecar() {
  if (sidecarProcess) {
    try {
      sidecarProcess.kill('SIGTERM');
    } catch {
      // ignore
    }
    sidecarProcess = null;
  }
  sidecarStatus = 'stopped';
  sidecarHeartbeatInFlight = false;
  sidecarReady = false;
  sidecarStdoutBuffer = '';
  startupDiagnostics.setComponent('sidecar', 'stopped', {
    detail: 'AI runtime stopped by desktop runtime.',
    reason: 'manual_stop',
    phase: 'stopped',
  });
  startupDiagnostics.pushEvent('sidecar', 'info', 'Sidecar stop requested.');
  emitDesktopHealth();
}

let win;
let overlayWin;
let tray;
const pendingLauncherConfirmations = new Map();
let appIsInstallingUpdate = false;
const STARTUP_UPDATE_CHECK_TIMEOUT_MS = 3_000;
let updateState = {
  status: 'idle',
  detail: 'Waiting to check for updates.',
  downloaded: false,
  downloadUrl: null,
  version: null,
  releaseNotes: {
    source: 'none',
    highlights: [],
    details: '',
    hasNotes: false,
  },
};
let pendingAuthFlow = null;
let silentRefreshTimer = null;
let splashTransitionDone = false;
let startupUpdateGatePromise = null;
let startupUpdateGateResolver = null;
let startupUpdateGateTimeout = null;
let startupUpdateGateSettled = false;

function sendToRenderer(channel, payload) {
  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
  if (overlayWin && !overlayWin.isDestroyed()) {
    overlayWin.webContents.send(channel, payload);
  }
}

function emitDesktopHealth() {
  sendToRenderer('desktop-health', startupDiagnostics.snapshot());
}

async function probeOllamaAvailability(source = 'startup') {
  try {
    const availability = await aiRouter.getAvailability();
    const status = availability.ollama_available ? 'healthy' : (availability.ollama_healthy ? 'degraded' : 'unavailable');
    const missingModels = Array.isArray(availability.missing_models) ? availability.missing_models : [];
    const cloudProviders = availability?.cloud?.providers || {};
    const readyCloudProviders = Object.entries(cloudProviders)
      .filter(([, entry]) => Boolean(entry?.ready))
      .map(([name]) => name);
    startupDiagnostics.setComponent('ollama', status, {
      detail: availability.ollama_available
        ? 'Ollama server is reachable.'
        : availability.ollama_healthy
          ? `Ollama reachable, but missing required models: ${missingModels.join(', ') || 'unknown'}.`
          : 'Ollama server is not reachable. Cloud fallback remains active.',
      reason: availability.ollama_available
        ? 'reachable'
        : availability.ollama_healthy ? 'missing_required_models' : 'unreachable',
      phase: 'probed',
      details: {
        source,
        mode: availability.mode,
        missingModels,
        requiredModels: availability.required_models || [],
        readyCloudProviders,
      },
    });
    startupDiagnostics.pushEvent(
      'ollama',
      availability.ollama_available ? 'info' : (availability.ollama_healthy ? 'warn' : 'warn'),
      availability.ollama_available
        ? 'Local Ollama runtime detected.'
        : availability.ollama_healthy
          ? 'Local Ollama reachable but required models are missing; using cloud fallback.'
          : 'Local Ollama runtime unavailable; using cloud fallback.',
      {
        source,
        mode: availability.mode,
        missingModels,
        readyCloudProviders,
      },
    );
    emitDesktopHealth();
    return availability;
  } catch (error) {
    startupDiagnostics.setComponent('ollama', 'unavailable', {
      detail: `Ollama probe failed: ${String(error?.message || error)}`,
      reason: 'probe_failed',
      phase: 'probed',
      details: { source },
    });
    startupDiagnostics.pushEvent('ollama', 'warn', 'Ollama probe failed.', {
      source,
      error: String(error?.message || error),
    });
    emitDesktopHealth();
    return { ollama_available: false, mode: 'cloud-fallback' };
  }
}

async function installLocalAiEngine() {
  const scriptPath = getSetupScriptPath();
  if (!fs.existsSync(scriptPath)) {
    return { success: false, error: `Setup script missing: ${scriptPath}` };
  }

  sendToRenderer('splash:progress', {
    depsPercent: 0,
    status: 'Installing Python dependencies…'
  });

  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      ['-ExecutionPolicy', 'Bypass', '-File', scriptPath],
      { windowsHide: true },
      async (error, stdout, stderr) => {
        // Parse progress from stdout (if any JSON-formatted progress messages)
        if (stdout) {
          const lines = String(stdout).split('\n');
          lines.forEach((line, idx) => {
            if (/pip install|Installing/.test(line)) {
              const progress = Math.min(100, 30 + Math.round((idx / lines.length) * 50));
              sendToRenderer('splash:progress', {
                depsPercent: progress,
                status: 'Installing Python dependencies…'
              });
            }
          });
        }

        if (error) {
          startupDiagnostics.pushEvent('ollama', 'error', 'Local AI setup script failed.', {
            message: String(error?.message || error),
            stderr: String(stderr || ''),
          });
          emitDesktopHealth();
          resolve({
            success: false,
            error: String(stderr || error?.message || 'setup-failed'),
            stdout: String(stdout || ''),
          });
          return;
        }

        sendToRenderer('splash:progress', {
          depsPercent: 100,
          status: 'Python dependencies installed.'
        });

        const availability = await probeOllamaAvailability('post-install');
        resolve({
          success: true,
          stdout: String(stdout || ''),
          availability,
        });
      },
    );
  });
}

async function routeAiRequest(payload = {}, options = {}) {
  const request = payload && typeof payload === 'object' ? payload : {};
  const streamId = String(request.streamId || '').trim();
  const onChunk = typeof options.onChunk === 'function'
    ? (event) => {
      try {
        options.onChunk({
          ...(event && typeof event === 'object' ? event : {}),
          streamId,
        });
      } catch {
        // ignore chunk forwarding errors
      }
    }
    : () => {};
  const response = await aiRouter.routeRequest({
    message: request.message || '',
    messages: Array.isArray(request.messages) ? request.messages : undefined,
    profile: request.profile,
    contextType: request.contextType,
    contextSize: request.contextSize,
    retryCount: request.retryCount,
    options: request.options,
  }, onChunk);
  return {
    ok: true,
    text: String(response?.text || ''),
    provider: response?.provider || response?.route?.provider || 'unknown',
    model: response?.model || response?.route?.model || 'unknown',
    route: response?.route || null,
    profile: response?.profile || null,
    availability: response?.availability || null,
    streamId,
  };
}

function allowWindowCloseForQuit() {
  return Boolean(app.isQuitting || appIsInstallingUpdate);
}

function prepareForQuitAndInstall(version = null) {
  appIsInstallingUpdate = true;
  app.isQuitting = true;
  telemetryBus.publish('updater.install.started', { version: version || updateState.version || null });
}

function resetQuitAndInstallPreparation() {
  appIsInstallingUpdate = false;
}

function emitUpdateStatus(status, detail, extra = {}) {
  updateState = {
    ...updateState,
    status,
    detail,
    ...extra,
  };
  sendToRenderer('auto-update-status', updateState);
  maybeResolveStartupUpdateGate(updateState);
  if (tray && !tray.isDestroyed()) {
    if (status === 'available') {
      tray.setToolTip('AssistantX — Update available ⬆️');
    } else if (status === 'install-ready') {
      tray.setToolTip('AssistantX — Restart to install update');
    } else {
      tray.setToolTip('Jarvis Desktop');
    }
  }
}

function resetStartupUpdateGate() {
  startupUpdateGateSettled = false;
  if (startupUpdateGateTimeout) {
    clearTimeout(startupUpdateGateTimeout);
    startupUpdateGateTimeout = null;
  }
}

function settleStartupUpdateGate(reason = 'resolved') {
  if (startupUpdateGateSettled) return;
  startupUpdateGateSettled = true;
  if (startupUpdateGateTimeout) {
    clearTimeout(startupUpdateGateTimeout);
    startupUpdateGateTimeout = null;
  }
  if (typeof startupUpdateGateResolver === 'function') {
    startupUpdateGateResolver({ reason });
  }
  startupUpdateGateResolver = null;
}

function maybeResolveStartupUpdateGate(state) {
  if (!state || startupUpdateGateSettled) return;
  const status = String(state.status || '').toLowerCase();
  if ([
    'up-to-date',
    'available',
    'downloading',
    'install-ready',
    'error',
    'unavailable',
    'disabled',
    'deferred',
  ].includes(status)) {
    settleStartupUpdateGate(status);
  }
}

function startStartupUpdateCheckGate() {
  if (startupUpdateGatePromise) return startupUpdateGatePromise;
  resetStartupUpdateGate();
  startupUpdateGatePromise = new Promise((resolve) => {
    startupUpdateGateResolver = resolve;
  });
  startupUpdateGateTimeout = setTimeout(() => {
    settleStartupUpdateGate('timeout');
  }, STARTUP_UPDATE_CHECK_TIMEOUT_MS);
  void Promise.resolve(checkForUpdates('startup'))
    .then((result) => {
      if (result?.ok === false) settleStartupUpdateGate(result.reason || 'check-failed');
    })
    .catch((error) => {
      settleStartupUpdateGate(String(error?.message || error || 'check-failed'));
    });
  return startupUpdateGatePromise;
}

function resetSplashTransitionState() {
  splashTransitionDone = false;
  startupUpdateGatePromise = null;
  startupUpdateGateResolver = null;
  resetStartupUpdateGate();
}

function transitionToIndexOnce() {
  if (splashTransitionDone) return;
  splashTransitionDone = true;
  if (win && !win.isDestroyed()) {
    win.loadFile('index.html').catch(() => {});
  }
}

function getJarvisWebBaseUrl() {
  return getJarvisWebUrl();
}

function getDesktopWindows() {
  return [win, overlayWin].filter((candidate) => candidate && !candidate.isDestroyed());
}

bindAuthEvents(() => getDesktopWindows());

function extractProtocolUrl(argv = []) {
  return argv.find((arg) => typeof arg === 'string' && arg.startsWith(`${AUTH_PROTOCOL}://`)) || null;
}

function getDesktopLoginUrl(state) {
  const loginUrl = new URL('/auth/login', getJarvisWebBaseUrl());
  loginUrl.searchParams.set('client', 'jarvis-desktop');
  loginUrl.searchParams.set('redirect_to', AUTH_CALLBACK_URL);
  loginUrl.searchParams.set('desktop_state', state);
  loginUrl.searchParams.set('state', state);
  return loginUrl.toString();
}

function settlePendingAuth(result) {
  if (!pendingAuthFlow || pendingAuthFlow.settled) return;
  const flow = pendingAuthFlow;
  pendingAuthFlow = null;
  flow.settled = true;
   if (flow.timeoutId) {
    clearTimeout(flow.timeoutId);
    flow.timeoutId = null;
  }
  flow.resolve(result);
}

function failPendingAuth(error) {
  if (!pendingAuthFlow || pendingAuthFlow.settled) return;
  const flow = pendingAuthFlow;
  pendingAuthFlow = null;
  flow.settled = true;
  if (flow.timeoutId) {
    clearTimeout(flow.timeoutId);
    flow.timeoutId = null;
  }
  sendToRenderer('auth:login-failed', {
    message: error?.message || String(error || 'Sign-in failed. Please try again from Settings.'),
  });
  flow.reject(error);
}

async function consumeAuthCallback(url, source = 'browser', { expectedState = null, settlePending = false } = {}) {
  try {
    const deepLink = new URL(url);
    const hashParams = new URLSearchParams(deepLink.hash.slice(1));
    const accessToken = deepLink.searchParams.get('access_token') || hashParams.get('access_token');
    const refreshToken = deepLink.searchParams.get('refresh_token') || hashParams.get('refresh_token');
    log('[auth] ACCESS TOKEN PARSED:', Boolean(accessToken));
    log('[auth] REFRESH TOKEN PARSED:', Boolean(refreshToken));
  } catch {
    // ignore parser diagnostics for malformed URLs
  }
  const parsed = parseAuthCallback(url, expectedState ? { expectedState } : {});
  if (!parsed) {
    console.warn(`[auth] OAuth callback not consumed from ${source}:`, redactUrl(url));
    return false;
  }
  if (parsed.error) {
    console.warn(`[auth] Ignoring invalid OAuth callback from ${source}:`, redactUrl(url));
    return true;
  }
  const savedSession = await setAccountSession(parsed.session, { reason: `login-${source}` });
  log('[auth] SESSION SAVED');
  if (settlePending) settlePendingAuth(toSafeSessionView(savedSession));
  return true;
}

function beginDesktopLogin() {
  if (pendingAuthFlow?.promise) {
    if (pendingAuthFlow.loginUrl) {
      void shell.openExternal(pendingAuthFlow.loginUrl).catch((error) => {
        console.warn('[auth] Failed to reopen OAuth browser URL:', error?.message || error);
      });
    }
    return pendingAuthFlow.promise;
  }

  const state = generateOAuthState();
  const loginUrl = getDesktopLoginUrl(state);
  const promise = new Promise((resolve, reject) => {
    pendingAuthFlow = {
      state,
      resolve,
      reject,
      promise: null,
      loginUrl,
      settled: false,
      timeoutId: null,
    };
  });
  pendingAuthFlow.promise = promise;
  pendingAuthFlow.timeoutId = setTimeout(() => {
    console.warn('[auth] Login flow timed out waiting for callback.');
    sendToRenderer('auth:login-timeout', {
      message: 'Sign-in timed out. Please try again from Settings → Account.',
    });
    settlePendingAuth(null);
  }, AUTH_LOGIN_TIMEOUT_MS);
  console.info('[auth] login started');
  shell.openExternal(loginUrl)
    .then(() => {
      console.info('[auth] oauth browser opened');
    })
    .catch((error) => {
      failPendingAuth(error);
    });
  return promise;
}

async function handleProtocolCallback(url, source = 'protocol') {
  if (!url) return false;
  if (process.env.AUTH_DEBUG === 'true') {
    log('[auth-debug] RAW URL:', url);
  }
  console.info('[auth] callback received', { source, url: redactUrl(url) });
  let consumed = false;
  try {
    consumed = await consumeAuthCallback(url, source, {
      expectedState: pendingAuthFlow?.state || null,
      settlePending: Boolean(pendingAuthFlow),
    });
  } catch (error) {
    console.error(`[auth] Failed to handle OAuth callback from ${source}:`, error?.message || error);
    failPendingAuth(error);
    return false;
  }
  if (consumed && win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
  return consumed;
}

async function restoreAuthSession() {
  const storedSession = await loadAccountSession();
  if (!storedSession?.accessToken) return null;
  const refreshedSession = await refreshSessionIfNeeded({ reason: 'restore' });
  if (refreshedSession?.accessToken) {
    if (refreshedSession.accessToken === storedSession.accessToken) {
      emitSessionChanged(refreshedSession, { reason: 'restore' });
    }
    return refreshedSession;
  }
  return null;
}

function startSilentRefreshLoop() {
  if (silentRefreshTimer) clearInterval(silentRefreshTimer);
  silentRefreshTimer = setInterval(() => {
    void refreshSessionIfNeeded({ reason: 'silent-refresh' }).catch((error) => {
      console.warn('[auth] Silent refresh failed:', error?.message || error);
    });
  }, SILENT_REFRESH_INTERVAL_MS);
}

function stopSilentRefreshLoop() {
  if (silentRefreshTimer) {
    clearInterval(silentRefreshTimer);
    silentRefreshTimer = null;
  }
}

// ── updater coordinator integration ───────────────────────────────────────────
let updateCoordinator = null;

function ensureUpdateCoordinator() {
  if (updateCoordinator) return updateCoordinator;
  updateCoordinator = createUpdateCoordinator({
    app,
    startupDiagnostics,
    telemetryBus,
    onHealth: emitDesktopHealth,
    onState(nextState) {
      emitUpdateStatus(nextState.status, nextState.detail, nextState);
    },
  });
  return updateCoordinator;
}

function getAutoUpdater() {
  return ensureUpdateCoordinator().getAutoUpdater();
}

function checkForUpdates(source = 'manual') {
  return ensureUpdateCoordinator().check({ source });
}

function downloadUpdate(source = 'user') {
  return ensureUpdateCoordinator().download({ source });
}

function installUpdate(source = 'user') {
  return ensureUpdateCoordinator().install({ source });
}

function deferUpdate(reason = 'later', source = 'user') {
  return ensureUpdateCoordinator().defer({ reason, source });
}

function getUpdateState() {
  return updateState;
}

function getUpdaterAuthStatus() {
  return ensureUpdateCoordinator().getPrivateTokenStatus();
}

function setUpdaterPrivateToken(token) {
  return ensureUpdateCoordinator().setPrivateToken(token);
}

function clearUpdaterPrivateToken() {
  return ensureUpdateCoordinator().clearPrivateToken();
}

function setupAutoUpdater() {
  ensureUpdateCoordinator().setup();
}

function getTrayIcon() {
  const candidates = [
    path.join(__dirname, 'tray-icon.png'),
    path.join(__dirname, 'tray-icon.ico'),
  ];
  const iconPath = candidates.find((candidate) => fs.existsSync(candidate));
  return iconPath ? nativeImage.createFromPath(iconPath) : nativeImage.createEmpty();
}

// ── Ollama NDJSON model-pull helper ──────────────────────────────────────────
// Ollama's /api/pull stream sends multiple JSON objects per TCP chunk.  We
// split the raw response body on newline boundaries before calling JSON.parse()
// to prevent SyntaxError from half-delivered or merged NDJSON tokens.
async function pullOllamaModel(model, onProgress) {
  const ollamaUrl = String(process.env.JARVIS_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const response = await fetch(`${ollamaUrl}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: model, stream: true }),
    signal: AbortSignal.timeout(600_000), // 10 min max for large models
  });
  if (!response.ok) {
    throw new Error(`Ollama pull returned ${response.status}`);
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let lineBuffer = '';
  let done = false;
  while (!done) {
    const { value, done: streamDone } = await reader.read();
    done = streamDone;
    if (value) lineBuffer += decoder.decode(value, { stream: !done });
    // Split on newlines — each line is one self-contained JSON object.
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const event = JSON.parse(trimmed);
        if (typeof onProgress === 'function') onProgress(event);
      } catch {
        // ignore malformed NDJSON lines (partial or unexpected content)
      }
    }
  }
  // Flush any remaining buffered content
  if (lineBuffer.trim()) {
    try {
      const event = JSON.parse(lineBuffer.trim());
      if (typeof onProgress === 'function') onProgress(event);
    } catch { /* ignore */ }
  }
}

// ── Startup screen router ─────────────────────────────────────────────────────
// Called immediately after the BrowserWindow is created.  Routes to the
// first-run setup wizard (when engine_mode is null/unset) or to the splash
// loading screen (when a mode has already been chosen).
function loadStartupScreen() {
  if (!win || win.isDestroyed()) return;
  const engineMode = getEngineMode();
  if (!engineMode) {
    // First run — show the engine-selection wizard.
    win.loadFile('setup-wizard.html');
  } else {
    // Engine already configured — show splash while services warm up.
    win.loadFile('splash.html').then(() => {
      startSplashTransition(engineMode).catch((err) => {
        console.error('[startup] Splash transition failed:', err?.message || err);
      });
    }).catch((err) => {
      console.error('[startup] Failed to load splash.html:', err?.message || err);
      if (win && !win.isDestroyed()) win.loadFile('index.html').catch(() => {});
    });
  }
}

// Drives the splash screen progress bars and transitions to index.html once
// the runtime is ready.
async function startSplashTransition(engineMode) {
  resetSplashTransitionState();
  const startupUpdateGate = startStartupUpdateCheckGate();
  if (engineMode !== 'local') {
    // Cloud and remote-server modes don't need a local Ollama model.
    const modeLabel = engineMode === 'byok-cloud' ? 'Cloud matrix' : 'Remote server';
    sendToRenderer('splash:progress', { status: `Verifying credentials for ${modeLabel.toLowerCase()}…` });
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    sendToRenderer('splash:progress', { status: `${modeLabel} ready. Launching Jarvis…` });
    await new Promise((resolve) => setTimeout(resolve, 600));
    await startupUpdateGate.catch(() => null);
    transitionToIndexOnce();
    return;
  }

  // ── Local engine: check for required model and pull if missing ──────────────
  const cfg = getJarvisModelConfig();
  const llmModel = cfg.llm_model || 'gemma3:4b';
  const ollamaUrl = String(process.env.JARVIS_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');

  sendToRenderer('splash:progress', { llmPercent: 0, status: `Checking for AI model ${llmModel}…` });

  let modelPresent = false;
  try {
    const tagsResp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3_000) });
    if (tagsResp.ok) {
      const payload = await tagsResp.json();
      const names = Array.isArray(payload?.models)
        ? payload.models.map((m) => String(m?.name || '').split(':')[0])
        : [];
      const llmBase = llmModel.split(':')[0];
      modelPresent = names.includes(llmBase) || names.includes(llmModel);
    }
  } catch { /* Ollama may not be running yet */ }

  if (!modelPresent) {
    sendToRenderer('splash:progress', { llmPercent: 0, status: `Downloading ${llmModel}… (this may take a few minutes)` });
    try {
      await pullOllamaModel(llmModel, (event) => {
        const total = Number(event?.total) || 0;
        const completed = Number(event?.completed) || 0;
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        sendToRenderer('splash:progress', {
          llmPercent: pct,
          status: String(event?.status || 'Downloading…'),
        });
      });
      sendToRenderer('splash:progress', { llmPercent: 100, status: 'Model download complete.' });
    } catch (err) {
      sendToRenderer('splash:progress', { error: `Failed to pull model: ${String(err?.message || err)}` });
    }
  } else {
    sendToRenderer('splash:progress', { llmPercent: 100, status: `Model ${llmModel} is ready.` });
  }

  // Wait for the Python sidecar to finish its health handshake (up to 20 s).
  sendToRenderer('splash:progress', { pyPercent: 0, status: 'Starting Python AI runtime…' });
  const sidecarTimeoutMs = 20_000;
  const sidecarPollMs = 500;
  const sidecarStart = Date.now();
  while (!sidecarReady && (Date.now() - sidecarStart) < sidecarTimeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, sidecarPollMs));
    const elapsed = Date.now() - sidecarStart;
    sendToRenderer('splash:progress', {
      pyPercent: Math.min(95, Math.round((elapsed / sidecarTimeoutMs) * 100)),
      status: 'Waiting for AI runtime…',
    });
  }
  sendToRenderer('splash:progress', {
    pyPercent: 100,
    status: sidecarReady ? 'AI runtime ready. Launching Jarvis…' : 'Launching Jarvis…',
  });

  if (sidecarReady) {
    const modelWaitDeadline = Date.now() + 900_000;
    const startupGraceDeadline = Date.now() + 2_500;
    while (Date.now() < modelWaitDeadline) {
      if (localVoiceAssetsState.complete) {
        sendToRenderer('splash:progress', {
          pyPercent: 100,
          status: localVoiceAssetsState.status || 'Local voice assets ready.',
        });
        break;
      }
      if (!localVoiceAssetsState.started && Date.now() >= startupGraceDeadline) {
        break;
      }
      if (localVoiceAssetsState.started) {
        sendToRenderer('splash:progress', {
          pyPercent: localVoiceAssetsState.percent,
          status: localVoiceAssetsState.status || 'Preparing local voice assets…',
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  await new Promise((resolve) => setTimeout(resolve, 400));
  await startupUpdateGate.catch(() => null);
  transitionToIndexOnce();
}

// Called by the 'setup:complete' IPC handler after the wizard saves its config.
// Transitions the main window from setup-wizard.html into the splash/index flow.
async function onSetupComplete(config) {
  log('[setup] Wizard completed, engine_mode:', config?.engine_mode);
  startupDiagnostics.pushEvent('setup', 'info', 'Setup wizard completed.', config);
  const engineMode = String(config?.engine_mode || '').trim();
  if (!win || win.isDestroyed()) return;
  await win.loadFile('splash.html');
  startSplashTransition(engineMode).catch((err) => {
    console.error('[setup] Splash transition error after wizard:', err?.message || err);
    if (win && !win.isDestroyed()) win.loadFile('index.html').catch(() => {});
  });
}

// Checks whether the signed-in account has an active paid subscription.
// Returns { ok: true, subscribed: bool, status: string }.
async function getSubscriptionStatus() {
  try {
    const session = getSafeAccountSession();
    if (!session?.accessToken) {
      return { ok: true, subscribed: false, status: 'unauthenticated' };
    }
    const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
    const anonKey = String(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || '').trim();
    if (!supabaseUrl || !anonKey) {
      return { ok: true, subscribed: true, status: 'authenticated' };
    }
    const headers = {
      apikey: anonKey,
      Authorization: 'Bearer ' + session.accessToken,
      Accept: 'application/json',
    };

    const workspaceResp = await fetch(
      `${supabaseUrl}/rest/v1/workspace_states?select=state_json&limit=1`,
      { headers, signal: AbortSignal.timeout(8_000) },
    );
    if (workspaceResp.ok) {
      const rows = await workspaceResp.json().catch(() => []);
      const row = Array.isArray(rows) ? rows[0] : null;
      const statePlan = String(row?.state_json?.userPlan || '').toLowerCase();
      if (statePlan === 'pro' || statePlan === 'pro+') {
        return { ok: true, subscribed: true, status: 'active', plan: statePlan };
      }
      if (statePlan === 'free') {
        return { ok: true, subscribed: false, status: 'active', plan: statePlan };
      }
    }

    const subscriptionResp = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?select=plan,status&limit=1`,
      { headers, signal: AbortSignal.timeout(8_000) },
    );
    if (!subscriptionResp.ok) {
      return { ok: true, subscribed: false, status: 'query-failed' };
    }
    const rows = await subscriptionResp.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    const isActive = row?.status === 'active' || row?.plan === 'pro' || row?.plan === 'pro+';
    return { ok: true, subscribed: isActive, status: row?.status || 'unknown', plan: row?.plan || null };
  } catch (err) {
    return { ok: false, subscribed: false, status: 'error', error: String(err?.message || err) };
  }
}

// Handles a map fly-to event emitted by the voice pipeline via IPC.
function onMapFlyTo({ lat, lon, label }) {
  if (win && !win.isDestroyed()) {
    win.webContents.send('map:fly-to', { lat: Number(lat) || 0, lon: Number(lon) || 0, label: String(label || '') });
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 560,
    frame: false,
    transparent: true,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: '#00000000',
    title: 'Jarvis Desktop',
    webPreferences: buildSecureWebPreferences({ preload: path.join(__dirname, 'preload.js') }),
  });

  loadStartupScreen();

  win.webContents.on('did-finish-load', () => {
    sendToRenderer('app-meta', {
      version: app.getVersion(),
      packaged: app.isPackaged,
    });
    sendToRenderer('auto-update-status', updateState);
    sendToRenderer('desktop-health', startupDiagnostics.snapshot());
    const safeSession = getSafeAccountSession();
    if (safeSession) {
      sendToRenderer('auth:session-changed', {
        session: safeSession,
        reason: 'window-ready',
      });
    }
  });

  win.on('close', (event) => {
    if (!allowWindowCloseForQuit()) {
      event.preventDefault();
      win.hide();
    }
  });
}

function createLauncherOverlayWindow() {
  overlayWin = new BrowserWindow({
    width: 640,
    height: 460,
    resizable: false,
    show: false,
    frame: false,
    transparent: true,
    hasShadow: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    title: 'AssistantX Launcher',
    webPreferences: buildSecureWebPreferences({ preload: path.join(__dirname, 'launcher-preload.js') }),
  });

  overlayWin.loadFile('launcher-overlay.html');
  overlayWin.webContents.on('did-finish-load', () => {
    overlayWin.webContents.send('sidecar-status', { status: sidecarStatus });
    overlayWin.webContents.send('desktop-health', startupDiagnostics.snapshot());
  });
  overlayWin.on('blur', () => {
    if (pendingLauncherConfirmations.size === 0 && !overlayWin.webContents.isDevToolsOpened()) {
      overlayWin.hide();
    }
  });
  overlayWin.on('close', (event) => {
    if (!allowWindowCloseForQuit()) {
      event.preventDefault();
      overlayWin.hide();
    }
  });
}

async function showLauncherOverlay() {
  if (!overlayWin || overlayWin.isDestroyed()) createLauncherOverlayWindow();
  const [recent, providerStatus, catalogHealth] = await Promise.all([
    Promise.resolve(launcherService.getRecentApps(8)),
    Promise.resolve(launcherService.getProviderStatus()),
    Promise.resolve(launcherService.getCatalogHealth()),
  ]);
  overlayWin.show();
  overlayWin.focus();
  overlayWin.webContents.send('launcher-overlay-focus', { recent, providerStatus, catalogHealth });
}

function toggleLauncherOverlay() {
  if (overlayWin?.isVisible()) {
    overlayWin.hide();
    return;
  }
  void showLauncherOverlay();
}

function registerLauncherShortcut() {
  const accelerator = process.platform === 'darwin' ? 'CommandOrControl+Space' : 'Control+Space';
  globalShortcut.unregisterAll();
  globalShortcut.register(accelerator, () => {
    toggleLauncherOverlay();
  });
}

async function maybePromptEverythingRecommendation() {
  if (!launcherService.shouldRecommendEverything()) return;
  const parentWindow = overlayWin && overlayWin.isVisible() ? overlayWin : win ?? null;
  const { response } = await dialog.showMessageBox(parentWindow, {
    type: 'question',
    title: 'Install Everything Search?',
    message: 'Install Everything Search for dramatically faster local search?',
    detail: [
      'Benefits:',
      '• instant app launching',
      '• ultra-fast file search',
      '• lower CPU usage',
      '• better Jarvis responsiveness',
      '',
      'AssistantX works without it, but performance improves significantly with Everything installed.',
    ].join('\n'),
    buttons: ['Install Everything', 'Maybe Later', "Don't Ask Again"],
    defaultId: 0,
    cancelId: 1,
  });

  if (response === 0) {
    await shell.openExternal('https://www.voidtools.com/downloads/');
    launcherService.remindLaterForEverything();
    return;
  }
  if (response === 2) {
    launcherService.disableEverythingRecommendation();
    return;
  }
  launcherService.remindLaterForEverything();
}

function createTray() {
  tray = new Tray(getTrayIcon());

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Show Jarvis', click: () => win.show() },
    { label: 'Open Launcher', click: () => toggleLauncherOverlay() },
    { label: 'Check for updates', click: () => void checkForUpdates('tray-manual') },
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

function getSidecarStatus() {
  return sidecarStatus;
}

function restartSidecarNow() {
  stopSidecar();
  telemetryBus.publish('sidecar.restart');
  setTimeout(() => startSidecar(), 500);
}

createMainIpcHandlers({
  ipcMain,
  app,
  shell,
  launcherService,
  ensureDbReady,
  getSidecarStatus,
  sendSidecarMessage,
  checkLocalAiAvailability: () => probeOllamaAvailability('ipc-check'),
  routeAiRequest,
  installLocalAiEngine,
  restartSidecar: restartSidecarNow,
  startupDiagnostics,
  getLocalTelemetrySnapshot,
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  deferUpdate,
  getUpdateState,
  getUpdaterAuthStatus,
  setUpdaterPrivateToken,
  clearUpdaterPrivateToken,
  getJarvisWebUrl,
  setJarvisWebUrl,
  telemetryBus,
  emitDesktopHealth,
  getAuthSessionView: () => getSafeAccountSession(),
  getDeviceToken,
  refreshAuthSession: async () => toSafeSessionView(await refreshSessionIfNeeded({ reason: 'ipc-refresh' })),
  signOutAccountSession: async (meta) => signOutAccountSession(meta),
  getAccountProfile: async () => getAccountProfile(),
  beginDesktopLogin,
  serverGetAuthStatus: () => serverBridge.getAuthStatus(),
  serverClearAuth: () => serverBridge.clearAuth(),
  serverVerifyPairing: (syncKey) => serverBridge.verifyPairing(syncKey),
  serverGetRuntimeStatus: () => serverBridge.getRuntimeStatus(),
  serverSetPermissionLevel: (level, fullControlConsent) => serverBridge.setPermissionLevel(level, fullControlConsent),
  serverKillSwitch: () => serverBridge.killSwitch(),
  serverGetConfig: () => serverBridge.getConfig(),
  serverSetConfig: (payload) => serverBridge.setConfig(payload),
  getMapConfig: () => ({
    accessToken: String(process.env.JARVIS_MAPBOX_ACCESS_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || '').trim(),
  }),
  localServerList: () => localServerStore.list(),
  localServerAdd: (payload) => localServerStore.add(payload),
  localServerUpdate: (serverId, patch) => localServerStore.update(serverId, patch),
  localServerRemove: (serverId) => localServerStore.remove(serverId),
  localServerScan: (serverId) => localServerStore.scan(serverId),
  localServerGetAssignment: () => localServerStore.getAssignment(),
  localServerSetAssignment: (patch) => localServerStore.setAssignment(patch),
  githubClient,
  googleClient,
  appsTool,
  getMainWindow: () => win,
  getOverlayWindow: () => overlayWin,
  createLauncherOverlayWindow,
  prepareForQuitAndInstall,
  resetQuitAndInstallPreparation,
  pendingLauncherConfirmations,
  permissions,
  securityAudit,
  mcpManager,
  mcpRouter,
  // ── First-run wizard + map fly-to ──────────────────────────────────────────
  onSetupComplete,
  getSubscriptionStatus,
  onMapFlyTo,
});

module.exports = {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
  deferUpdate,
  getUpdateState,
  getUpdaterAuthStatus,
  setUpdaterPrivateToken,
  clearUpdaterPrivateToken,
  getAutoUpdater,
  setupAutoUpdater,
  emitUpdateStatus,
};

app.on('open-url', (event, url) => {
  event.preventDefault();
  void handleProtocolCallback(url, 'open-url');
});

app.on('second-instance', (_event, argv) => {
  const protocolUrl = extractProtocolUrl(argv);
  if (protocolUrl) {
    void handleProtocolCallback(protocolUrl, 'second-instance');
  }
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
});

let shutdownPresenceSyncInFlight = null;
async function syncShutdownPresence() {
  if (shutdownPresenceSyncInFlight) return shutdownPresenceSyncInFlight;
  const supabaseUrl = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim().replace(/\/$/, '');
  const supabaseKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || '').trim();
  const deviceId = String(process.env.JARVIS_DEVICE_ID || '').trim();
  if (!supabaseUrl || !supabaseKey || !deviceId) return null;
  shutdownPresenceSyncInFlight = fetch(`${supabaseUrl}/rest/v1/device_presence?device_id=eq.${encodeURIComponent(deviceId)}`, {
    method: 'PATCH',
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      status: 'offline',
      is_online: false,
      updated_at: new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    }),
  }).catch(() => null);
  return shutdownPresenceSyncInFlight;
}

app.on('session-end', () => {
  void syncShutdownPresence();
});

app.on('before-quit', () => {
  app.isQuitting = true;
  void syncShutdownPresence();
});

nativeAutoUpdater?.on?.('before-quit-for-update', () => {
  prepareForQuitAndInstall(updateState.version || null);
});

app.whenReady().then(async () => {
  log('AUTH_DEBUG:', process.env.AUTH_DEBUG);
  telemetryBus.publish('updater.session.started', { currentVersion: app.getVersion() });
  setLauncherPhase('validating-runtime', 'Validating launcher runtime.');
  const startupProtocolUrl = extractProtocolUrl(process.argv);
  if (startupProtocolUrl) {
    void handleProtocolCallback(startupProtocolUrl, 'startup-argv');
  }
  // Initialise the SQLite database (sql.js loads its WASM binary asynchronously)
  // before any launcher or IPC code touches it.
  try {
    await require('./launcher/db').init();
    startupDiagnostics.setComponent('db', 'healthy', {
      detail: 'Database initialized successfully.',
      reason: 'db_ready',
      phase: 'healthy',
    });
    startupDiagnostics.pushEvent('startup', 'info', 'Launcher DB initialization completed.');
    telemetryBus.publish('startup.healthy');
  } catch (err) {
    console.error('[db] Failed to initialise database:', err.message);
    startupDiagnostics.setComponent('db', 'unavailable', {
      detail: `Database initialization failed: ${err.message}`,
      reason: 'db_init_failed',
      details: { error: err.message },
      phase: 'validating-runtime',
    });
    startupDiagnostics.pushEvent('startup', 'error', 'Launcher DB initialization failed.', { message: err.message });
    telemetryBus.publish('startup.unavailable');
  }
  emitDesktopHealth();
  await restoreAuthSession();
  startSilentRefreshLoop();
  await probeOllamaAvailability('startup');
  startSidecar();
  createWindow();
  createLauncherOverlayWindow();
  createTray();
  registerLauncherShortcut();
  setupAutoUpdater();
  setLauncherPhase('loading-models', 'Loading AI runtime models.');
  launcherService.refreshCatalog({ reason: 'app-ready' })
    .then(() => {
      startupDiagnostics.setComponent('launcher', 'healthy', {
        detail: 'Launcher catalog refreshed.',
        reason: 'catalog_ready',
        phase: 'healthy',
      });
      startupDiagnostics.pushEvent('launcher', 'info', 'Launcher catalog refresh completed.');
      telemetryBus.publish('startup.healthy');
      emitDesktopHealth();
      return maybePromptEverythingRecommendation();
    })
    .catch((error) => {
      console.warn('[launcher] startup refresh failed:', error.message);
      startupDiagnostics.setComponent('launcher', 'degraded', {
        detail: `Launcher catalog refresh failed: ${error.message}`,
        reason: 'catalog_refresh_failed',
        details: { error: error.message },
        phase: 'loading-models',
      });
      startupDiagnostics.pushEvent('launcher', 'warn', 'Launcher refresh failed.', { message: error.message });
      telemetryBus.publish('startup.degraded');
      emitDesktopHealth();
    });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    stopSidecar();
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  stopSilentRefreshLoop();
  stopSidecar();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  } else {
    win.show();
  }
  void checkForUpdates('activate-manual');
});
