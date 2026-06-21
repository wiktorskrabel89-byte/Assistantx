const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, desktopCapturer, dialog, globalShortcut, ipcMain, screen, shell, Tray, Menu, nativeImage, autoUpdater: nativeAutoUpdater } = require('electron');
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
const os = require('os');
const launcherService = require('./launcher/launch-service');
const launcherDb = require('./launcher/db');
const { createStartupDiagnostics } = require('./services/startup-diagnostics');
const { createEventBus } = require('./telemetry/event-bus');
const { getLocalTelemetrySnapshot, wireLocalTelemetry } = require('./telemetry/local-telemetry');
const { buildSecureWebPreferences } = require('./electron/main/window-security');
const { createMainIpcHandlers } = require('./electron/ipc/register-main-handlers');
const { createUpdateCoordinator } = require('./electron/updater/coordinator');
const { createPermissionPolicy } = require('./electron/permissions/policy');
const { ensurePythonDependencies } = require('./electron/sidecar/ensure-python-deps');
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
const { createCompressionEngine } = require('./electron/memory/context/compression-engine');
const { createVerificationEngine } = require('./electron/ai/verification/engine');
const { preflight: adaptiveThinkingPreflight, postflight: adaptiveThinkingPostflight } = require('./electron/ai/core/adaptive-thinking');
const { runRealityCheck } = require('./electron/ai/core/reality-check');
const { createDecisionMemory } = require('./electron/ai/core/decision-memory');
const { recordFailureLesson, recordSuccessAnalysis } = require('./electron/ai/core/learning-hierarchy');
const { createTrustEngine } = require('./electron/ai/core/trust-engine');
const { createSelfDiagnosticEngine } = require('./electron/ai/core/self-diagnostic');
const { scanForRisk, annotateResponse: annotateRiskyResponse } = require('./electron/ai/core/devils-advocate');
const { buildDecisionContext, executiveDecide } = require('./electron/ai/core/decision-context');

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
let sidecarDead = false;
let sidecarFatalError = null;
// Self-healing IPC observer state — automatic retry with exponential backoff
// after unexpected sidecar exits.
let sidecarHealRetryCount = 0;
let sidecarHealTimer = null;
// startSidecar() now awaits a possibly multi-minute first-time Python
// dependency install before spawning anything, leaving sidecarProcess
// null the whole time. Without this guard, the health-observer's periodic
// probe (every 12s) sees "no process" during that wait and keeps
// triggering MORE concurrent startSidecar() calls, each of which would
// eventually try to spawn its own duplicate sidecar once the (deduped)
// install resolves.
let sidecarStartInFlight = false;
const SIDECAR_HEAL_MAX_RETRIES = 5;
const SIDECAR_HEAL_BASE_DELAY_MS = 1_500;
let sidecarUserInitiatedStop = false;
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
  onRouteDecided: (decision) => {
    // M5-followup: forward every routing decision into the Diagnostics
    // terminal (Settings → Zaawansowane) and the Activity Panel's "Log
    // wykonania" segment via the existing health:pulse-style fan-out.
    // The renderer subscribes to 'router:decision' (added to preload
    // ALLOWED_RECEIVE for this round).
    sendToRenderer('router:decision', decision);
  },
});
// Phase 1 LOCK LIST — Context Compression Engine. Stores are assigned once
// registerWindowControlHandlers() runs (module load, before any chat can
// fire); routeAiRequest only reads them later, on an actual IPC call.
let workspaceMemoryStore = null;
let workspaceKnowledgeStore = null;
const compressionEngine = createCompressionEngine();
compressionEngine.on('context-compressed', (stats) => {
  sendToRenderer('context:compressed', stats);
});
// Phase 1 LOCK LIST — Basic Review Pipeline. Reuses the same verification
// engine the Runtime V2 orchestrator uses (electron/ai/verification), but
// invoked directly from the live chat path so it doesn't require opting
// into the full multi-agent orchestrator (explicitly out of scope).
const reviewEngine = createVerificationEngine();
// Jarvis Core systems #10/#12/#13 — Decision Memory, Trust Engine and the
// Self Diagnostic Engine are JSON-on-disk / timer-driven singletons with no
// dependency on `app` being ready, so they're created here at module scope
// (same as compressionEngine/reviewEngine above). healthObserverRef is
// hoisted and assigned once registerWindowControlHandlers() creates the
// real health observer, mirroring the workspace-store hoisting pattern.
const decisionMemory = createDecisionMemory();
const trustEngine = createTrustEngine();
let healthObserverRef = null;
const selfDiagnosticEngine = createSelfDiagnosticEngine({
  getHealthSnapshot: () => (healthObserverRef ? healthObserverRef.snapshot() : null),
  getTrustModels: () => trustEngine.rankModels(),
});
selfDiagnosticEngine.on('report', (report) => {
  sendToRenderer('self-diagnostic:report', report);
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
  // Root-cause fix (2026-06): bare commands like 'python3'/'python' used to
  // get exists=null and were accepted unconditionally — so 'python3' always
  // "won" by array order even on machines (e.g. this Windows box) that only
  // have 'python' on PATH, producing a silent `spawn python3 ENOENT` and the
  // sidecar staying "offline" with no diagnostic. We now actually resolve
  // bare commands via `where`/`which` (sync, short timeout, no shell) so the
  // first REAL match wins regardless of array position — correct on every
  // platform instead of just the one we happened to test on.
  const whichCmd = process.platform === 'win32' ? 'where' : 'which';
  function resolveBareCommand(name) {
    try {
      const { execFileSync } = require('child_process');
      const out = execFileSync(whichCmd, [name], { stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 });
      return out.toString('utf8').trim().length > 0;
    } catch {
      return false;
    }
  }
  const candidateDetails = candidates.map((candidate) => {
    const isPath = candidate.includes(path.sep);
    const exists = isPath ? fs.existsSync(candidate) : resolveBareCommand(candidate);
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
  // Self-healing observer succeeded — clear the retry counter so future
  // crashes get a fresh exponential-backoff budget.
  if (sidecarHealRetryCount > 0) {
    log(`[sidecar:heal] handshake succeeded after ${sidecarHealRetryCount} retries; resetting counter.`);
    sidecarHealRetryCount = 0;
  }
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
  // Diagnostic instrumentation (temporary, per systematic-debugging Phase 1):
  // log every successfully-parsed stdout payload so we can see in this
  // terminal whether 'model_download_complete' actually crosses the
  // Python→Electron boundary, instead of only seeing JSON-parse failures.
  log(`[sidecar:json] type=${payload?.type} phase=${payload?.phase}`);
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

async function startSidecar() {
  if (sidecarStartInFlight) return;
  sidecarStartInFlight = true;
  try {
    await startSidecarImpl();
  } finally {
    sidecarStartInFlight = false;
  }
}

async function startSidecarImpl() {
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

  // Auto-heal a missing/incomplete sidecar Python environment instead of
  // crash-looping forever (the embeddable Python bundled with packaged
  // builds ships with no dependencies pre-installed — see ai-agent's
  // requirements.txt). Installs directly into the interpreter's own
  // site-packages — an embeddable Python with a `._pth` file file ignores
  // PYTHONPATH entirely, so a --target/PYTHONPATH approach can't work
  // here. Falls back to a UAC-elevated retry if the direct install can't
  // write into Program Files (one-time; every later launch's probe finds
  // the packages already on disk and skips straight past this).
  const requirementsPath = path.join(path.dirname(mainPy), 'requirements.txt');
  setLauncherPhase('loading-models', 'Checking AI runtime Python dependencies.');
  const depsResult = await ensurePythonDependencies({
    pythonPath: python,
    requirementsPath,
    onProgress: ({ status, index, total }) => {
      setLauncherPhase('loading-models', status);
      const depsPercent = Number.isFinite(index) && Number.isFinite(total) && total > 0
        ? Math.round((index / total) * 100)
        : undefined;
      sendToRenderer('splash:progress', { status, depsPercent });
    },
  });
  if (!depsResult.skipped) {
    log('[sidecar] Python dependency install:', depsResult.ok ? 'ok' : 'incomplete', depsResult);
    startupDiagnostics.pushEvent('sidecar', depsResult.ok ? 'info' : 'warn',
      depsResult.ok ? 'Installed missing Python dependencies.' : 'Python dependency install incomplete.',
      depsResult);
    sendToRenderer('splash:progress', {
      depsPercent: 100,
      status: depsResult.ok ? 'AI runtime dependencies ready.' : 'Some AI runtime dependencies could not be installed.',
    });
  }

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
    // Surface fatal Python errors to splash so users see WHY startup hangs.
    if (/ModuleNotFoundError|ImportError|Traceback \(most recent call last\)/.test(line)) {
      sidecarFatalError = line.slice(0, 240);
      startupDiagnostics.pushEvent('sidecar', 'error', 'Python sidecar reported a fatal error.', {
        message: sidecarFatalError,
      });
      sendToRenderer('splash:progress', {
        error: `Python runtime error: ${sidecarFatalError}`,
      });
    }
    sendToRenderer('sidecar-status', { status: sidecarStatus });
  });

  sidecarProcess.on('exit', (code, signal) => {
    log(`[sidecar] process exited: code=${code} signal=${signal}`);
    sidecarProcess = null;
    sidecarHeartbeatInFlight = false;
    sidecarReady = false;
    // Flag for the splash poll so it can break out of the wait loop instead of timing out.
    if (code && code !== 0) sidecarDead = true;
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
    // Self-healing: schedule an automatic restart if this wasn't user-initiated.
    if (!sidecarUserInitiatedStop) {
      scheduleSidecarHeal(`exit-code-${code ?? 'unknown'}`);
    }
    sidecarUserInitiatedStop = false;
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

// Model warm-up — Ollama unloads a model's weights from memory after it's
// been idle, so the FIRST chat/code request after a cold start pays the
// full load time on top of inference (can be many seconds for larger
// models). Sending an empty-prompt /api/generate forces Ollama to load
// the model into memory without generating anything, so by the time the
// user actually sends a message it's already warm. keep_alive keeps it
// resident for 30 minutes, matching normal idle-chat usage patterns.
const ollamaWarmedModels = new Set();
async function warmUpOllamaModel(modelName) {
  const model = String(modelName || '').trim();
  if (!model || ollamaWarmedModels.has(model)) return;
  ollamaWarmedModels.add(model);
  const url = String(process.env.JARVIS_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
  const startedAt = Date.now();
  try {
    await fetch(`${url}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, prompt: '', keep_alive: '30m' }),
    });
    log(`[warmup] Ollama model "${model}" preloaded in ${Date.now() - startedAt}ms.`);
  } catch (error) {
    ollamaWarmedModels.delete(model); // allow retry on the next probe
    log(`[warmup] Failed to preload Ollama model "${model}":`, error?.message || error);
  }
}

function warmUpLocalModels() {
  const modelConfig = getJarvisModelConfig();
  const assignment = localServerStore.getAssignment() || {};
  const candidates = new Set([modelConfig.llm_model, assignment.chatModelId, assignment.codeModelId].filter(Boolean));
  for (const model of candidates) {
    void warmUpOllamaModel(model);
  }
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
    // Fire-and-forget — only on startup/post-install, not every manual
    // Settings → Modele "check" click (those shouldn't re-warm on every poll).
    if (availability.ollama_available && (source === 'startup' || source === 'post-install')) {
      void warmUpLocalModels();
    }
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
  const rawMessages = Array.isArray(request.messages) ? request.messages : [];
  const { messages: compressedMessages } = compressionEngine.compress(rawMessages, {
    query: request.message || '',
    memoryStore: workspaceMemoryStore,
    knowledgeStore: workspaceKnowledgeStore,
  });

  // ── Jarvis Core preflight (systems #8, #9) ───────────────────────────────
  // Execution Modes sets the ceiling/floor Adaptive Thinking operates
  // within; Reality Check + Contradiction Detector + Simulation Engine run
  // as a pre-execution pipeline. Warnings are surfaced to diagnostics but
  // never block dispatch — Basic scope per the Phase 1 LOCK LIST.
  const executionMode = adaptiveThinkingPreflight({
    message: request.message || '',
    contextType: request.contextType,
    retryCount: request.retryCount,
  });
  const realityCheck = runRealityCheck({
    message: request.message || '',
    knowledgeStore: workspaceKnowledgeStore,
    memoryStore: workspaceMemoryStore,
  });
  if (!realityCheck.ok) {
    sendToRenderer('reality-check:result', { ...realityCheck, streamId });
  }

  const response = await aiRouter.routeRequest({
    message: request.message || '',
    messages: compressedMessages.length ? compressedMessages : undefined,
    images: Array.isArray(request.images) ? request.images : undefined,
    profile: request.profile,
    contextType: request.contextType,
    contextSize: request.contextSize,
    retryCount: request.retryCount,
    source: request.source,
    options: request.options,
  }, onChunk);

  // ── Jarvis Core postflight (systems #8, #9, #11-#15) ─────────────────────
  const taskType = request.contextType === 'code' ? 'coding' : 'general';
  const review = await reviewEngine.verify(response, { taskType }).catch((err) => ({ ok: false, reason: String(err?.message || err) }));
  sendToRenderer('review:result', { ...review, taskType, streamId });

  const { confidence } = adaptiveThinkingPostflight({ response, route: response?.route, mode: executionMode.mode });
  const advocate = scanForRisk(response?.text);
  const modelId = response?.model || response?.route?.model || 'unknown';
  const trustScoreVal = trustEngine.trustScore(modelId);

  const decisionContext = buildDecisionContext({
    mode: executionMode.mode,
    confidence,
    realityCheck,
    review,
    trustScore: trustScoreVal,
    advocate,
  });
  const action = executiveDecide(decisionContext);

  trustEngine.recordOutcome(modelId, { ok: review.ok, confidence });
  selfDiagnosticEngine.recordReviewOutcome(review.ok);
  decisionMemory.recordDecision({
    mode: executionMode.mode,
    confidence,
    route: response?.route || null,
    reviewOk: review.ok,
    advocateFlags: advocate.flags,
    action,
  });
  sendToRenderer('decision-context:result', { ...decisionContext, action, streamId });

  const finalText = advocate.risky
    ? annotateRiskyResponse(String(response?.text || ''), advocate.flags)
    : String(response?.text || '');

  return {
    ok: true,
    text: finalText,
    provider: response?.provider || response?.route?.provider || 'unknown',
    model: modelId,
    route: response?.route || null,
    profile: response?.profile || null,
    availability: response?.availability || null,
    streamId,
    decision: { mode: executionMode.mode, confidence, action },
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
  splashSkipRequested = false;
  startupUpdateGatePromise = null;
  startupUpdateGateResolver = null;
  sidecarDead = false;
  sidecarFatalError = null;
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

// ── Ollama daemon liveness check + autostart ─────────────────────────────────
// The splash used to call /api/pull directly even when the Ollama daemon was
// not running, producing an unrecoverable "fetch failed" error. This helper
// probes /api/tags, spawns `ollama serve` detached if missing, and retries
// the probe with a short backoff. Returns true if the daemon is reachable.
async function probeOllamaOnce(ollamaUrl, timeoutMs = 2_000) {
  try {
    const resp = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(timeoutMs) });
    return resp.ok;
  } catch {
    return false;
  }
}

async function ensureOllamaRunning(ollamaUrl) {
  if (await probeOllamaOnce(ollamaUrl)) return true;
  log('[ollama] Daemon not reachable. Attempting to spawn `ollama serve`.');
  try {
    const child = spawn('ollama', ['serve'], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (err) {
    log('[ollama] Failed to spawn `ollama serve`:', err?.message || err);
    return false;
  }
  for (let i = 0; i < 10; i++) {
    await new Promise((resolve) => setTimeout(resolve, 1_000));
    if (await probeOllamaOnce(ollamaUrl)) {
      log(`[ollama] Daemon became reachable after ${i + 1}s.`);
      return true;
    }
  }
  log('[ollama] Daemon never became reachable after 10s of retries.');
  return false;
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

  // Make sure the Ollama daemon is alive before we try to talk to it. Without
  // this, /api/pull throws "fetch failed" and the splash gets stuck.
  const ollamaUp = await ensureOllamaRunning(ollamaUrl);
  if (!ollamaUp) {
    sendToRenderer('splash:progress', {
      llmPercent: 100,
      status: 'Local AI unavailable — switching to cloud mode.',
    });
    // Skip the pull entirely. The renderer's router has cloud fallback already.
  } else {
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
    } catch { /* tags probe failed; treat as missing and try pull */ }

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
        // Soft-fail: log it, mark the bar full, and let cloud fallback handle requests.
        log('[ollama] Model pull failed:', err?.message || err);
        sendToRenderer('splash:progress', {
          llmPercent: 100,
          status: 'Model unavailable. Cloud mode active.',
        });
      }
    } else {
      sendToRenderer('splash:progress', { llmPercent: 100, status: `Model ${llmModel} is ready.` });
    }
  }

  // Wait for the Python sidecar to finish its health handshake (up to 20 s).
  sendToRenderer('splash:progress', { pyPercent: 0, status: 'Starting Python AI runtime…' });
  const sidecarTimeoutMs = 20_000;
  const sidecarPollMs = 500;
  const sidecarStart = Date.now();
  while (!sidecarReady && !sidecarDead && (Date.now() - sidecarStart) < sidecarTimeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, sidecarPollMs));
    const elapsed = Date.now() - sidecarStart;
    sendToRenderer('splash:progress', {
      pyPercent: Math.min(95, Math.round((elapsed / sidecarTimeoutMs) * 100)),
      status: 'Waiting for AI runtime…',
    });
  }
  if (sidecarDead) {
    sendToRenderer('splash:progress', {
      pyPercent: 100,
      status: 'AI runtime crashed — using cloud mode.',
      error: sidecarFatalError ? `Python runtime: ${sidecarFatalError}` : 'Python runtime exited unexpectedly.',
    });
  } else {
    sendToRenderer('splash:progress', {
      pyPercent: 100,
      status: sidecarReady ? 'AI runtime ready. Launching Jarvis…' : 'Launching Jarvis…',
    });
  }

  if (sidecarReady) {
    // First-run install can legitimately take many minutes (downloading
    // Whisper + Kokoro). Warm boots should never wait more than ~60s.
    // We detect first run by checking if voice assets are tracked at all.
    const isFirstRun = !localVoiceAssetsState.complete && !localVoiceAssetsState.started;
    const modelWaitDeadline = Date.now() + (isFirstRun ? 600_000 : 60_000);
    const startupGraceDeadline = Date.now() + 2_500;
    while (Date.now() < modelWaitDeadline && !splashSkipRequested) {
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
          status: localVoiceAssetsState.status || 'Preparing local voice assets… (will continue in background)',
        });
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!localVoiceAssetsState.complete && localVoiceAssetsState.started) {
      sendToRenderer('splash:progress', {
        status: 'Voice models still downloading in background — launching Jarvis now.',
      });
    }
  } else {
    // Sidecar never reported ready. Tell the user we're proceeding anyway so
    // chat still works (cloud or BYOK paths don't need the sidecar).
    sendToRenderer('splash:progress', {
      error: 'AI runtime did not start (Python sidecar offline). Chat works in cloud mode; voice features may be unavailable.',
    });
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

  // Dev-only — auto-open DevTools so renderer console errors (e.g. a
  // connection that hangs on "Starting…") are visible immediately without
  // relying on a keyboard shortcut that may be intercepted by the global
  // hotkey registration attempted before 'ready'. Never runs in a packaged
  // build — packaged installs stay clean for end users.
  if (!app.isPackaged) {
    win.webContents.openDevTools({ mode: 'right' });
  }

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

// HUD window controls — renderer-driven min/max/close so the borderless
// frame still gives users full window agency. Registered once at module load.
let windowControlsRegistered = false;
function registerWindowControlHandlers() {
  if (windowControlsRegistered) return;
  windowControlsRegistered = true;
  ipcMain.handle('window:minimize', () => {
    try {
      const w = BrowserWindow.getFocusedWindow() || win;
      if (w && !w.isDestroyed()) w.minimize();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
  ipcMain.handle('window:toggle-maximize', () => {
    try {
      const w = BrowserWindow.getFocusedWindow() || win;
      if (!w || w.isDestroyed()) return { ok: false, error: 'no-window' };
      if (w.isMaximized()) w.unmaximize();
      else w.maximize();
      return { ok: true, maximized: w.isMaximized() };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
  ipcMain.handle('window:close', () => {
    try {
      const w = BrowserWindow.getFocusedWindow() || win;
      if (w && !w.isDestroyed()) w.close();
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  // V2.0 Health Observer — periodic Ollama + sidecar probes with auto-heal.
  const { createHealthObserver } = require('./electron/diagnostics/health-observer');
  const healthObserver = createHealthObserver({
    intervalMs: 12_000,
    cooldownMs: 45_000,
    probeTimeoutMs: 4_000,
    log: (...args) => log('[health]', ...args),
  });
  healthObserverRef = healthObserver;
  healthObserver.registerProbe('sidecar', () => {
    if (!sidecarProcess) return { status: 'unavailable', detail: 'no-process' };
    if (sidecarReady) return { status: 'healthy', detail: 'stdio-handshake-ok' };
    return { status: 'degraded', detail: `status=${sidecarStatus}` };
  });
  healthObserver.registerProbe('ollama', async () => {
    const url = String(process.env.JARVIS_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    try {
      const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(2_500) });
      if (resp.ok) return { status: 'healthy', detail: 'tags-endpoint-200' };
      return { status: 'degraded', detail: `tags-endpoint-${resp.status}` };
    } catch (err) {
      return { status: 'unavailable', detail: String(err?.message || err) };
    }
  });
  healthObserver.registerHealer('sidecar', () => {
    if (sidecarHealTimer || sidecarHealRetryCount >= SIDECAR_HEAL_MAX_RETRIES) return;
    log('[health] sidecar healer invoked');
    scheduleSidecarHeal('health-observer');
  });
  healthObserver.registerHealer('ollama', async () => {
    log('[health] ollama healer invoked');
    const url = String(process.env.JARVIS_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, '');
    await ensureOllamaRunning(url);
  });
  healthObserver.on('change', (payload) => {
    log(`[health] ${payload.subsystem} → ${payload.status}`, payload.detail || '');
    sendToRenderer('health:pulse', payload);
  });
  healthObserver.on('heal-attempted', (payload) => {
    sendToRenderer('health:heal-attempted', payload);
  });
  healthObserver.on('heal-outcome', (payload) => {
    sendToRenderer('health:heal-outcome', payload);
  });
  // Start the loop after a short delay so initial startup probes don't fire
  // before Ollama/sidecar have had a chance to come up.
  setTimeout(() => {
    try { healthObserver.start(); }
    catch (err) { log('[health] observer failed to start:', err?.message || err); }
  }, 6_000);
  ipcMain.handle('health:snapshot', () => healthObserver.snapshot());

  // Jarvis Core #13 — Self Diagnostic Engine. Starts on the same delay as
  // the health observer it consumes, so its first report isn't computed
  // off an empty/uninitialized snapshot.
  setTimeout(() => {
    try { selfDiagnosticEngine.start(); }
    catch (err) { log('[self-diagnostic] failed to start:', err?.message || err); }
  }, 7_000);
  ipcMain.handle('self-diagnostic:snapshot', () => selfDiagnosticEngine.runOnce());

  // Local Execution Bridge — sandboxed CLI runner per V2.0 Section 4.
  // Off by default; user must flip dev_mode_exec in settings.
  const { createLocalExecutionBridge } = require('./electron/exec/local-execution-bridge');
  const localExecutionBridge = createLocalExecutionBridge({
    getConfig: () => {
      try {
        const cfg = getJarvisModelConfig();
        return { dev_mode_exec: Boolean(cfg?.local?.dev_mode_exec) };
      } catch { return { dev_mode_exec: false }; }
    },
    log: (...args) => log('[exec-bridge]', ...args),
    defaultCwd: app.getPath('userData'),
  });
  ipcMain.handle('exec:run', async (event, payload) => {
    try {
      const requestId = String(payload?.requestId || Date.now());
      return await localExecutionBridge.exec(payload, (chunk) => {
        try {
          event.sender?.send('exec:chunk', { requestId, ...chunk });
        } catch { /* sender gone */ }
      });
    } catch (err) {
      return { ok: false, error: 'handler_threw', detail: String(err?.message || err) };
    }
  });
  ipcMain.handle('exec:list-allowed', () => {
    try {
      return { ok: true, categories: localExecutionBridge.listAllowedCategories(), enabled: localExecutionBridge.isEnabled() };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  // ─── Idea #5 — Conversation memory (cross-session persistence) ───────────
  // Thin disk-backed log of {timestamp, role, text} entries persisted to
  // userData. Complements the sidecar's RAG MemoryStore — this is the
  // recall layer for "what did we just talk about?" rather than vector
  // search. Capped at 200 entries to keep the JSON small.
  const memoryLogPath = path.join(app.getPath('userData'), 'jarvis-conversation.json');
  const MEMORY_LOG_MAX = 200;
  function readMemoryLog() {
    try {
      if (!fs.existsSync(memoryLogPath)) return [];
      const raw = JSON.parse(fs.readFileSync(memoryLogPath, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch { return []; }
  }
  function writeMemoryLog(list) {
    try {
      fs.writeFileSync(
        memoryLogPath,
        JSON.stringify(list.slice(-MEMORY_LOG_MAX)),
        'utf8',
      );
    } catch (err) {
      log('[memory] write failed:', err?.message || err);
    }
  }
  ipcMain.handle('memory:save', (_event, payload) => {
    try {
      const role = String(payload?.role || 'user').slice(0, 16);
      const text = String(payload?.text || '').trim();
      if (!text) return { ok: false, error: 'empty-text' };
      const entry = { ts: Date.now(), role, text: text.slice(0, 4_000) };
      const list = readMemoryLog();
      list.push(entry);
      writeMemoryLog(list);
      return { ok: true, count: list.length };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
  ipcMain.handle('memory:list-recent', (_event, payload) => {
    try {
      const limit = Math.max(1, Math.min(50, Number(payload?.limit) || 20));
      const list = readMemoryLog();
      return { ok: true, entries: list.slice(-limit) };
    } catch (err) {
      return { ok: false, error: String(err?.message || err), entries: [] };
    }
  });

  // ─── M7/M8 — Memory + Knowledge stores backing the Workspace tab. ───
  // Lazy singletons so the JSON files aren't created until first read.
  const { createMemoryStore } = require('./electron/memory/store/memory-store');
  const { createKnowledgeStore } = require('./electron/memory/store/knowledge-store');
  const { createSkillConfidenceStore } = require('./electron/memory/store/skill-confidence-store');
  const { hybridSearch } = require('./electron/memory/retrieval/hybrid-search');
  workspaceMemoryStore = createMemoryStore({ baseDir: app.getPath('userData') });
  workspaceKnowledgeStore = createKnowledgeStore({ baseDir: app.getPath('userData') });
  const workspaceSkillStore = createSkillConfidenceStore({ baseDir: app.getPath('userData') });

  ipcMain.handle('workspace:memory-snapshot', () => {
    try { return { ok: true, snapshot: workspaceMemoryStore.snapshot() }; }
    catch (err) { return { ok: false, error: String(err?.message || err) }; }
  });
  ipcMain.handle('workspace:knowledge-snapshot', () => {
    try { return { ok: true, snapshot: workspaceKnowledgeStore.snapshot() }; }
    catch (err) { return { ok: false, error: String(err?.message || err) }; }
  });
  ipcMain.handle('workspace:skills-snapshot', () => {
    try { return { ok: true, skills: workspaceSkillStore.rankSkills() }; }
    catch (err) { return { ok: false, error: String(err?.message || err), skills: [] }; }
  });
  // Voice Input gap-fix (fix d) — lets voice-gateway.js collapse STT
  // confidence onto the same success/failure ledger used by the router's
  // skill-confidence system, instead of a separate ad-hoc tracking scheme.
  ipcMain.handle('workspace:skill-track', (_event, payload) => {
    try {
      const id = String(payload?.skillId || payload?.id || '').trim();
      if (!id) return { ok: false, error: 'missing-skill-id' };
      const runtimeMs = Number(payload?.runtimeMs) || 0;
      const isFailure = payload?.outcome === 'failure';
      const stats = isFailure
        ? workspaceSkillStore.trackFailure(id, runtimeMs)
        : workspaceSkillStore.trackSuccess(id, runtimeMs);
      // Jarvis Core #11 — Learning Hierarchy / Failure Analysis & Learning
      // Validation / Success Analysis Engine. Every tracked outcome feeds
      // the knowledge graph so failures become reviewable lessons and
      // success streaks get a symmetrical "what worked" record.
      let lesson = null;
      try {
        lesson = isFailure
          ? recordFailureLesson({ skillId: id, cause: String(payload?.cause || 'unspecified'), knowledgeStore: workspaceKnowledgeStore })
          : recordSuccessAnalysis({ skillId: id, stats, knowledgeStore: workspaceKnowledgeStore });
      } catch { /* learning-hierarchy is best-effort, never blocks skill tracking */ }
      return { ok: true, stats, lesson };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
  ipcMain.handle('workspace:search', (_event, payload) => {
    try {
      const query = String(payload?.query || '').trim();
      if (!query) return { ok: true, results: [] };
      const results = hybridSearch({
        query,
        sources: Array.isArray(payload?.sources) ? payload.sources : [],
        memoryStore: workspaceMemoryStore,
        knowledgeStore: workspaceKnowledgeStore,
      }).slice(0, Math.max(1, Math.min(50, Number(payload?.limit) || 25)));
      return { ok: true, results };
    } catch (err) {
      return { ok: false, error: String(err?.message || err), results: [] };
    }
  });
  ipcMain.handle('workspace:memory-remember', (_event, payload) => {
    try { return { ok: true, entry: workspaceMemoryStore.rememberLongTerm(payload || {}) }; }
    catch (err) { return { ok: false, error: String(err?.message || err) }; }
  });
  ipcMain.handle('workspace:knowledge-upsert', (_event, payload) => {
    try { return { ok: true, entity: workspaceKnowledgeStore.upsertEntity(payload || {}) }; }
    catch (err) { return { ok: false, error: String(err?.message || err) }; }
  });
  ipcMain.handle('workspace:knowledge-remove', (_event, payload) => {
    try { return { ok: true, removed: workspaceKnowledgeStore.removeEntity(String(payload?.id || '')) }; }
    catch (err) { return { ok: false, error: String(err?.message || err) }; }
  });

  // Phase 1 LOCK LIST — Project Files Panel. Opens a native file picker and
  // appends the chosen paths to the project entity's payload.files array
  // (previously always initialized empty and never written to afterward).
  ipcMain.handle('workspace:project-attach-file', async (_event, payload) => {
    try {
      const projectId = String(payload?.projectId || '').trim();
      if (!projectId) return { ok: false, error: 'missing-project-id' };
      const entity = workspaceKnowledgeStore.getEntity(projectId);
      if (!entity || entity.type !== 'project') return { ok: false, error: 'project-not-found' };

      const win = BrowserWindow.fromWebContents(_event.sender);
      const { canceled, filePaths } = await dialog.showOpenDialog(win, {
        title: 'Dodaj plik do projektu',
        properties: ['openFile', 'multiSelections'],
      });
      if (canceled || !filePaths.length) return { ok: false, error: 'canceled' };

      const existingFiles = Array.isArray(entity.payload?.files) ? entity.payload.files : [];
      const newFiles = filePaths.map((filePath) => ({
        path: filePath,
        name: path.basename(filePath),
        addedAt: Date.now(),
      }));
      const updated = workspaceKnowledgeStore.upsertEntity({
        ...entity,
        payload: { ...entity.payload, files: [...existingFiles, ...newFiles] },
      });
      return { ok: true, entity: updated };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
  ipcMain.handle('workspace:project-remove-file', (_event, payload) => {
    try {
      const projectId = String(payload?.projectId || '').trim();
      const filePath = String(payload?.path || '').trim();
      if (!projectId || !filePath) return { ok: false, error: 'missing-arguments' };
      const entity = workspaceKnowledgeStore.getEntity(projectId);
      if (!entity || entity.type !== 'project') return { ok: false, error: 'project-not-found' };

      const existingFiles = Array.isArray(entity.payload?.files) ? entity.payload.files : [];
      const updated = workspaceKnowledgeStore.upsertEntity({
        ...entity,
        payload: { ...entity.payload, files: existingFiles.filter((f) => f.path !== filePath) },
      });
      return { ok: true, entity: updated };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  // ─── Intelligent Requirements System — Blueprinty generation ────────────
  // Routes the goal through the same chat dispatch path as ordinary chat
  // (routeAiRequest -> promptRegistry composer), so generated blueprints
  // carry the AI Constitution and routing/persona prompts like any other
  // model call. Result is stored as a `blueprint` knowledge entity.
  const { generateBlueprint } = require('./electron/ai/requirements-engine');
  ipcMain.handle('workspace:blueprint-generate', async (_event, payload) => {
    try {
      const goal = String(payload?.goal || '').trim();
      if (!goal) return { ok: false, error: 'goal-required' };
      const blueprint = await generateBlueprint({
        goal,
        dispatch: async (prompt) => {
          const result = await routeAiRequest({ message: prompt });
          if (!result?.ok) throw new Error(result?.error || 'blueprint-dispatch-failed');
          return result.text;
        },
      });
      const entity = workspaceKnowledgeStore.upsertEntity({
        type: 'blueprint',
        label: goal,
        payload: { ...blueprint, projectId: payload?.projectId || null },
      });
      return { ok: true, entity };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  // ─── Idea #3 — Screen capture for the vision dispatch slot ───────────────
  // Grabs the primary display via desktopCapturer (already supported in
  // Electron without extra entitlements on Win/Linux), returns a data URL
  // the renderer can hand to the vision model.
  ipcMain.handle('vision:capture-screen', async () => {
    try {
      const display = screen.getPrimaryDisplay();
      const { width, height } = display.workAreaSize;
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: {
          width: Math.min(1920, width),
          height: Math.min(1080, height),
        },
      });
      const source = sources?.[0];
      if (!source || source.thumbnail.isEmpty()) {
        return { ok: false, error: 'no-display-source' };
      }
      const thumb = source.thumbnail;
      const size = thumb.getSize();
      return {
        ok: true,
        dataUrl: thumb.toDataURL(),
        width: size.width,
        height: size.height,
        sourceName: source.name,
      };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });

  // ─── Idea #4 — Global hotkey to summon the orb window ─────────────────────
  // CommandOrControl+Alt+J jumps the user back to Jarvis from anywhere.
  // If the window is hidden / minimized / behind other apps, it's restored
  // and focused; if it's already visible and focused, it's hidden so the
  // hotkey acts as a toggle.
  try {
    const summonAccelerator = process.platform === 'darwin' ? 'CommandOrControl+Option+J' : 'Control+Alt+J';
    const summonOk = globalShortcut.register(summonAccelerator, () => {
      try {
        const target = win;
        if (!target || target.isDestroyed()) return;
        const focused = BrowserWindow.getFocusedWindow();
        if (target.isVisible() && focused === target) {
          target.hide();
        } else {
          if (target.isMinimized()) target.restore();
          target.show();
          target.focus();
        }
      } catch (err) {
        log('[hotkey] summon failed:', err?.message || err);
      }
    });
    if (summonOk) log(`[hotkey] Jarvis summon bound to ${summonAccelerator}`);
  } catch (err) {
    log('[hotkey] global registration failed:', err?.message || err);
  }

  // Hardware tier auto-detect for the setup wizard.
  // Returns { totalRamGB, cpuCount, gpus[], suggestedProfile } where profile is
  // one of: 'eco' (Potato) | 'standard' (Pro) | 'pro' (Enthusiast).
  ipcMain.handle('hardware:probe', async () => {
    try {
      const totalRamGB = +(os.totalmem() / (1024 ** 3)).toFixed(1);
      const cpuCount = os.cpus().length;
      let gpus = [];
      try {
        const info = await app.getGPUInfo('complete');
        const devices = Array.isArray(info?.gpuDevice) ? info.gpuDevice : [];
        gpus = devices
          .filter((d) => !d.softwareRendering)
          .map((d) => ({
            vendorId: d.vendorId,
            deviceId: d.deviceId,
            active: Boolean(d.active),
          }));
      } catch (err) {
        log('[hardware] getGPUInfo failed:', err?.message || err);
      }

      // Heuristic: discrete GPU is detected by non-Intel/non-software renderer.
      // Vendor IDs: 0x10de=NVIDIA, 0x1002=AMD. We can't read VRAM directly from
      // Electron, so we trust RAM + GPU count as a rough discriminator.
      const hasDiscreteGpu = gpus.some((g) => {
        const v = Number(g.vendorId);
        return v === 0x10de || v === 0x1002;
      });

      let suggestedProfile = 'eco';
      if (totalRamGB >= 32 && hasDiscreteGpu && gpus.length >= 1) {
        suggestedProfile = 'pro';
      } else if (totalRamGB >= 16 && hasDiscreteGpu) {
        suggestedProfile = 'standard';
      } else if (totalRamGB >= 8 && hasDiscreteGpu) {
        suggestedProfile = 'standard';
      }

      return {
        ok: true,
        totalRamGB,
        cpuCount,
        gpus,
        hasDiscreteGpu,
        suggestedProfile,
        platform: process.platform,
        arch: process.arch,
      };
    } catch (err) {
      return { ok: false, error: String(err?.message || err) };
    }
  });
}
registerWindowControlHandlers();

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
  sidecarUserInitiatedStop = true;
  stopSidecar();
  telemetryBus.publish('sidecar.restart');
  // Cancel any pending auto-heal — user explicitly requested a restart.
  if (sidecarHealTimer) { clearTimeout(sidecarHealTimer); sidecarHealTimer = null; }
  sidecarHealRetryCount = 0;
  setTimeout(() => startSidecar(), 500);
}

// Self-healing observer: schedules an automatic sidecar restart with
// exponential backoff (1.5s, 3s, 6s, 12s, 24s) up to SIDECAR_HEAL_MAX_RETRIES.
// On successful sidecar handshake, retry count resets in markSidecarReady().
function scheduleSidecarHeal(reason = 'unknown') {
  if (sidecarHealTimer) return; // already pending
  // A start attempt (including a possibly multi-minute first-time Python
  // dependency install) is already running — there's nothing to heal yet.
  // Without this, the health-observer's periodic "no process" probe burns
  // through the whole retry budget and gives up while the in-flight
  // install is still working, even though it would have succeeded.
  if (sidecarStartInFlight) return;
  if (sidecarHealRetryCount >= SIDECAR_HEAL_MAX_RETRIES) {
    log(`[sidecar:heal] max retries reached (${SIDECAR_HEAL_MAX_RETRIES}); giving up. reason=${reason}`);
    startupDiagnostics.pushEvent('sidecar', 'error', 'Auto-heal gave up after max retries.', {
      retries: sidecarHealRetryCount,
      reason,
    });
    return;
  }
  sidecarHealRetryCount += 1;
  const delayMs = SIDECAR_HEAL_BASE_DELAY_MS * Math.pow(2, sidecarHealRetryCount - 1);
  log(`[sidecar:heal] scheduling restart #${sidecarHealRetryCount} in ${delayMs}ms (reason=${reason})`);
  startupDiagnostics.pushEvent('sidecar', 'info', 'Auto-heal scheduled.', {
    attempt: sidecarHealRetryCount,
    delayMs,
    reason,
  });
  sidecarHealTimer = setTimeout(() => {
    sidecarHealTimer = null;
    if (sidecarProcess) return; // already running again
    log(`[sidecar:heal] running auto-restart #${sidecarHealRetryCount}`);
    try {
      startSidecar();
    } catch (err) {
      log('[sidecar:heal] startSidecar threw:', err?.message || err);
    }
  }, delayMs);
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
