const fs = require('fs');
const os = require('os');
const path = require('path');

const BASE_DIR = path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'JarvisDesktop');
const STATE_PATH = path.join(BASE_DIR, 'state.json');
const MAX_HISTORY = 120;
const MAX_TASKS = 40;

const DEFAULT_STATE = {
  history: [],
  tasks: [],
  preferences: {
    appLaunchCount: {},
    recentApps: [],
    recentFiles: [],
    recentPrompts: [],
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
    preferences: {
      ...DEFAULT_STATE.preferences,
      ...(raw?.preferences && typeof raw.preferences === 'object' ? raw.preferences : {}),
      appLaunchCount: raw?.preferences?.appLaunchCount && typeof raw.preferences.appLaunchCount === 'object'
        ? raw.preferences.appLaunchCount
        : {},
      recentApps: Array.isArray(raw?.preferences?.recentApps) ? raw.preferences.recentApps : [],
      recentFiles: Array.isArray(raw?.preferences?.recentFiles) ? raw.preferences.recentFiles : [],
      recentPrompts: Array.isArray(raw?.preferences?.recentPrompts) ? raw.preferences.recentPrompts : [],
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
  } catch {
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

function getFavoriteApp() {
  const state = readState();
  const entries = Object.entries(state.preferences.appLaunchCount || {});
  if (entries.length === 0) {
    return state.preferences.recentApps[0] || null;
  }
  entries.sort((a, b) => b[1] - a[1]);
  return entries[0]?.[0] || null;
}

module.exports = {
  appendHistory,
  getFavoriteApp,
  readState,
  rememberApp,
  rememberFile,
  rememberPrompt,
  saveTask,
  statePath: STATE_PATH,
};
