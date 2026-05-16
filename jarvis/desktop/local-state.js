const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const STATE_PATH = path.join(BASE_DIR, 'state.json');
const MAX_HISTORY = 120;
const MAX_TASKS = 40;

const DEFAULT_STATE = {
  schemaVersion: 2,
  history: [],
  tasks: [],
  schedules: [],
  preferences: {
    appLaunchCount: {},
    recentApps: [],
    recentFiles: [],
    recentPrompts: [],
    appAliases: {},
    discoveredApps: [],
    appCatalogMeta: {
      lastScanAt: null,
      appCount: 0,
      source: null,
    },
    resolverHistory: [],
    syncOptions: {
      syncChatHistory: true,
      syncMemories: true,
      syncTasksReminders: true,
      syncVoiceSettings: true,
      syncAnalyticsUsage: false,
      syncAutomations: true,
      syncLocalFiles: false,
      localOnlyMode: false,
      encryptedSync: false,
      pauseSync: false,
    },
     telemetry: {
       enabledLocal: true,
       remoteUploadEnabled: false,
       consentGranted: false,
       lastUpdatedAt: null,
      sidecar: {
        started: 0,
        running: 0,
        exits: 0,
        errors: 0,
        reconnects: 0,
        unavailable: 0,
        restarts: 0,
        lastEventAt: null,
      },
       startup: {
         healthy: 0,
         degraded: 0,
         unavailable: 0,
         lastEventAt: null,
       },
       updater: {
         offered: 0,
         accepted: 0,
         deferred: 0,
         rolloutDeferred: 0,
         downloadStarted: 0,
         downloaded: 0,
         downloadFailed: 0,
         fullFallbacks: 0,
         installStarted: 0,
         installSucceeded: 0,
         installFailed: 0,
         signatureVerified: 0,
         signatureFailed: 0,
         lastEventAt: null,
         lastOfferedVersion: null,
         lastDownloadedVersion: null,
         pendingInstallVersion: null,
         lastInstallerExitCode: null,
       },
     },
   },
 };

function ensureBaseDir() {
  fs.mkdirSync(BASE_DIR, { recursive: true });
}

function normalizeState(raw) {
  return {
    ...DEFAULT_STATE,
    ...raw,
    history: Array.isArray(raw?.history) ? raw.history : [],
    tasks: Array.isArray(raw?.tasks) ? raw.tasks : [],
    schedules: Array.isArray(raw?.schedules) ? raw.schedules : [],
    preferences: {
      ...DEFAULT_STATE.preferences,
      ...(raw?.preferences && typeof raw.preferences === 'object' ? raw.preferences : {}),
      appLaunchCount: raw?.preferences?.appLaunchCount && typeof raw.preferences.appLaunchCount === 'object'
        ? raw.preferences.appLaunchCount
        : {},
      recentApps: Array.isArray(raw?.preferences?.recentApps) ? raw.preferences.recentApps : [],
      recentFiles: Array.isArray(raw?.preferences?.recentFiles) ? raw.preferences.recentFiles : [],
      recentPrompts: Array.isArray(raw?.preferences?.recentPrompts) ? raw.preferences.recentPrompts : [],
      appAliases: raw?.preferences?.appAliases && typeof raw.preferences.appAliases === 'object'
        ? raw.preferences.appAliases
        : {},
      discoveredApps: Array.isArray(raw?.preferences?.discoveredApps) ? raw.preferences.discoveredApps : [],
      appCatalogMeta: raw?.preferences?.appCatalogMeta && typeof raw.preferences.appCatalogMeta === 'object'
        ? {
          ...DEFAULT_STATE.preferences.appCatalogMeta,
          ...raw.preferences.appCatalogMeta,
        }
        : { ...DEFAULT_STATE.preferences.appCatalogMeta },
      resolverHistory: Array.isArray(raw?.preferences?.resolverHistory) ? raw.preferences.resolverHistory : [],
      telemetry: raw?.preferences?.telemetry && typeof raw.preferences.telemetry === 'object'
        ? {
          ...DEFAULT_STATE.preferences.telemetry,
          ...raw.preferences.telemetry,
          sidecar: {
            ...DEFAULT_STATE.preferences.telemetry.sidecar,
            ...(raw.preferences.telemetry.sidecar && typeof raw.preferences.telemetry.sidecar === 'object'
              ? raw.preferences.telemetry.sidecar
              : {}),
          },
          startup: {
            ...DEFAULT_STATE.preferences.telemetry.startup,
            ...(raw.preferences.telemetry.startup && typeof raw.preferences.telemetry.startup === 'object'
              ? raw.preferences.telemetry.startup
              : {}),
          },
          updater: {
            ...DEFAULT_STATE.preferences.telemetry.updater,
            ...(raw.preferences.telemetry.updater && typeof raw.preferences.telemetry.updater === 'object'
              ? raw.preferences.telemetry.updater
              : {}),
          },
        }
        : { ...DEFAULT_STATE.preferences.telemetry },
    },
  };
}

function readState() {
  ensureBaseDir();
  try {
    if (!fs.existsSync(STATE_PATH)) {
      writeState(DEFAULT_STATE);
      return normalizeState(DEFAULT_STATE);
    }
    const raw = JSON.parse(fs.readFileSync(STATE_PATH, 'utf-8'));
    return normalizeState(raw);
  } catch (err) {
    console.warn('[local-state] Failed to read state file, using defaults:', err?.message || err);
    return normalizeState(DEFAULT_STATE);
  }
}

function writeState(nextState) {
  ensureBaseDir();
  fs.writeFileSync(STATE_PATH, JSON.stringify(normalizeState(nextState), null, 2));
}

function updateState(updater) {
  const current = readState();
  const next = normalizeState(updater(current));
  writeState(next);
  return next;
}

function prependUnique(list, value, limit = 10) {
  if (!value) return list.slice(0, limit);
  const normalized = String(value).trim();
  if (!normalized) return list.slice(0, limit);
  return [normalized, ...list.filter((item) => item !== normalized)].slice(0, limit);
}

function appendHistory(entry) {
  return updateState((current) => ({
    ...current,
    history: [
      {
        id: entry.id || `history-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: entry.createdAt || new Date().toISOString(),
        ...entry,
      },
      ...current.history,
    ].slice(0, MAX_HISTORY),
  }));
}

function rememberPrompt(prompt) {
  if (!prompt) return readState();
  return updateState((current) => ({
    ...current,
    preferences: {
      ...current.preferences,
      recentPrompts: prependUnique(current.preferences.recentPrompts, prompt, 20),
    },
  }));
}

function rememberApp(app) {
  if (!app) return readState();
  const key = String(app).trim().toLowerCase();
  if (!key) return readState();
  return updateState((current) => ({
    ...current,
    preferences: {
      ...current.preferences,
      appLaunchCount: {
        ...current.preferences.appLaunchCount,
        [key]: (current.preferences.appLaunchCount[key] || 0) + 1,
      },
      recentApps: prependUnique(current.preferences.recentApps, key, 12),
    },
  }));
}

function getAppAliases() {
  return { ...(readState().preferences.appAliases || {}) };
}

function setAppAlias(alias, app) {
  const normalizedAlias = String(alias || '').trim().toLowerCase();
  const normalizedApp = String(app || '').trim().toLowerCase();
  if (!normalizedAlias || !normalizedApp) return readState();
  return updateState((current) => ({
    ...current,
    preferences: {
      ...current.preferences,
      appAliases: {
        ...current.preferences.appAliases,
        [normalizedAlias]: normalizedApp,
      },
    },
  }));
}

function removeAppAlias(alias) {
  const normalizedAlias = String(alias || '').trim().toLowerCase();
  if (!normalizedAlias) return readState();
  return updateState((current) => {
    const nextAliases = { ...(current.preferences.appAliases || {}) };
    delete nextAliases[normalizedAlias];
    return {
      ...current,
      preferences: {
        ...current.preferences,
        appAliases: nextAliases,
      },
    };
  });
}

function getDiscoveredApps() {
  const state = readState();
  return Array.isArray(state.preferences.discoveredApps)
    ? state.preferences.discoveredApps
    : [];
}

function saveDiscoveredApps(apps, meta = {}) {
  const normalizedApps = Array.isArray(apps) ? apps.slice(0, 1000) : [];
  return updateState((current) => ({
    ...current,
    preferences: {
      ...current.preferences,
      discoveredApps: normalizedApps,
      appCatalogMeta: {
        ...DEFAULT_STATE.preferences.appCatalogMeta,
        ...(current.preferences.appCatalogMeta || {}),
        ...meta,
        appCount: normalizedApps.length,
        lastScanAt: new Date().toISOString(),
      },
    },
  }));
}

function recordResolverDecision(entry) {
  if (!entry || typeof entry !== 'object') return readState();
  return updateState((current) => ({
    ...current,
    preferences: {
      ...current.preferences,
      resolverHistory: [
        {
          id: entry.id || `resolver-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          createdAt: entry.createdAt || new Date().toISOString(),
          ...entry,
        },
        ...(current.preferences.resolverHistory || []),
      ].slice(0, 120),
    },
  }));
}

function rememberFile(filePath) {
  if (!filePath) return readState();
  return updateState((current) => ({
    ...current,
    preferences: {
      ...current.preferences,
      recentFiles: prependUnique(current.preferences.recentFiles, filePath, 15),
    },
  }));
}

function saveTask(task) {
  return updateState((current) => ({
    ...current,
    tasks: [task, ...current.tasks.filter((item) => item.id !== task.id)].slice(0, MAX_TASKS),
  }));
}

function getTelemetrySnapshot() {
  return { ...(readState().preferences.telemetry || DEFAULT_STATE.preferences.telemetry) };
}

function updateTelemetry(updater) {
  if (typeof updater !== 'function') return getTelemetrySnapshot();
  const nextState = updateState((current) => {
    const currentTelemetry = current.preferences?.telemetry || DEFAULT_STATE.preferences.telemetry;
    const updatedTelemetry = updater({ ...currentTelemetry }) || currentTelemetry;
    return {
      ...current,
      preferences: {
        ...current.preferences,
        telemetry: {
          ...DEFAULT_STATE.preferences.telemetry,
          ...updatedTelemetry,
          sidecar: {
            ...DEFAULT_STATE.preferences.telemetry.sidecar,
            ...(updatedTelemetry?.sidecar || {}),
          },
          startup: {
            ...DEFAULT_STATE.preferences.telemetry.startup,
            ...(updatedTelemetry?.startup || {}),
          },
          updater: {
            ...DEFAULT_STATE.preferences.telemetry.updater,
            ...(updatedTelemetry?.updater || {}),
          },
          lastUpdatedAt: new Date().toISOString(),
        },
      },
    };
  });
  return { ...(nextState.preferences.telemetry || DEFAULT_STATE.preferences.telemetry) };
}

function getFavoriteApp() {
  const state = readState();
  const entries = Object.entries(state.preferences.appLaunchCount || {});
  if (entries.length === 0) {
    return state.preferences.recentApps[0] || null;
  }
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || null;
}

// ── Scheduled tasks (#9) ──────────────────────────────────────────────────────
// schedule shape: { id, label, command, args, cronExpr, enabled, lastRunAt, nextRunAt }
// cronExpr examples: 'every 30 minutes', 'daily at 08:00', 'every 2 hours'

function parseNextRun(cronExpr) {
  const now = Date.now();
  const match = String(cronExpr || '').trim().match(
    /^every\s+(\d+)\s+(minutes?|hours?|days?)|^daily\s+at\s+(\d{1,2}):(\d{2})/i,
  );
  if (!match) return null;
  if (match[1] && match[2]) {
    const n = Number(match[1]);
    const unit = match[2].toLowerCase();
    const ms = unit.startsWith('minute') ? n * 60_000
      : unit.startsWith('hour') ? n * 3_600_000
        : n * 86_400_000;
    return new Date(now + ms).toISOString();
  }
  if (match[3] !== undefined) {
    const next = new Date();
    next.setHours(Number(match[3]), Number(match[4]), 0, 0);
    if (next.getTime() <= now) next.setDate(next.getDate() + 1);
    return next.toISOString();
  }
  return null;
}

function addSchedule(schedule) {
  const nextRunAt = parseNextRun(schedule.cronExpr);
  return updateState((current) => ({
    ...current,
    schedules: [
      {
        id: schedule.id || `sched-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        label: schedule.label || schedule.command,
        command: schedule.command,
        args: schedule.args || {},
        cronExpr: schedule.cronExpr || '',
        enabled: schedule.enabled !== false,
        lastRunAt: null,
        nextRunAt,
        createdAt: new Date().toISOString(),
        ...schedule,
      },
      ...current.schedules,
    ],
  }));
}

function removeSchedule(id) {
  return updateState((current) => ({
    ...current,
    schedules: current.schedules.filter((s) => s.id !== id),
  }));
}

function updateScheduleRun(id, nextRunAt) {
  return updateState((current) => ({
    ...current,
    schedules: current.schedules.map((s) =>
      s.id === id
        ? { ...s, lastRunAt: new Date().toISOString(), nextRunAt }
        : s,
    ),
  }));
}

function getSchedules() {
  return readState().schedules;
}

// ── Cloud memory sync (#14) ───────────────────────────────────────────────────
// Sync preferences + recent history to a workspace API endpoint.
async function syncToCloud(apiUrl, token, options = {}) {
  if (!apiUrl || !token) return { ok: false, reason: 'missing-config' };
  try {
    const state = readState();
    const syncOptions = state.preferences?.syncOptions || DEFAULT_STATE.preferences.syncOptions;
    // Strip discoveredApps — it is machine-specific and can be re-scanned locally.
    // Sending it would inflate the payload with up to 1000 app entries on every sync.
    const { discoveredApps: _discoveredApps, ...prefsToSync } = state.preferences;
    const payload = {
      preferences: prefsToSync,
      history: state.history.slice(0, 50),
      tasks: state.tasks.slice(0, MAX_TASKS),
      schedules: state.schedules.slice(0, MAX_TASKS),
      voiceSettings: options.voiceSettings || {},
      syncOptions,
      syncMetadata: {
        schemaVersion: 1,
        sourceDevice: 'jarvis-desktop',
        clientUpdatedAt: new Date().toISOString(),
      },
    };
    const response = await fetch(`${apiUrl}/api/workspaces/jarvis-state`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });
    return { ok: response.ok, status: response.status };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function loadFromCloud(apiUrl, token) {
  if (!apiUrl || !token) return { ok: false, reason: 'missing-config' };
  try {
    const response = await fetch(`${apiUrl}/api/workspaces/jarvis-state`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return { ok: false, status: response.status };
    const remote = await response.json();
    if (remote?.preferences) {
      const remoteTasks = Array.isArray(remote.tasks) ? remote.tasks : [];
      const remoteSchedules = Array.isArray(remote.schedules) ? remote.schedules : [];
      const mergeByIdNewest = (localItems, incomingItems) => {
        const map = new Map();
        [...localItems, ...incomingItems].forEach((item) => {
          const id = String(item?.id || '');
          if (!id) return;
          const existing = map.get(id);
          if (!existing) {
            map.set(id, item);
            return;
          }
          const existingTs = Date.parse(existing.updatedAt || existing.createdAt || 0);
          const incomingTs = Date.parse(item.updatedAt || item.createdAt || 0);
          if (incomingTs >= existingTs) map.set(id, item);
        });
        return Array.from(map.values());
      };
      updateState((current) => ({
        ...current,
        preferences: { ...current.preferences, ...remote.preferences },
        history: remote.history?.length
          ? [...(remote.history || []), ...current.history].slice(0, MAX_HISTORY)
          : current.history,
        tasks: mergeByIdNewest(current.tasks, remoteTasks).slice(0, MAX_TASKS),
        schedules: mergeByIdNewest(current.schedules, remoteSchedules).slice(0, MAX_TASKS),
      }));
    }
    return { ok: true, voiceSettings: remote?.voiceSettings || null };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = {
  addSchedule,
  appendHistory,
  getAppAliases,
  getDiscoveredApps,
  getFavoriteApp,
  getSchedules,
  loadFromCloud,
  parseNextRun,
  recordResolverDecision,
  readState,
  removeAppAlias,
  rememberApp,
  rememberFile,
  rememberPrompt,
  removeSchedule,
  getTelemetrySnapshot,
  saveDiscoveredApps,
  saveTask,
  setAppAlias,
  statePath: STATE_PATH,
  syncToCloud,
  updateTelemetry,
  updateScheduleRun,
};
