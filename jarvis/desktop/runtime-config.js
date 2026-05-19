const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_DEV_WEB_URL = 'http://localhost:3000';
const DEFAULT_PROD_WEB_URL = 'https://assistantx.pl';
const DEFAULT_VOICE_PROVIDER_MODE = 'assistantx-server';
const DEFAULT_RUNTIME_MODE = 'local-desktop';
const DEFAULT_REMOTE_RUNTIME_API_URL = 'http://127.0.0.1:9001';
const DEFAULT_REMOTE_RUNTIME_WS_URL = 'ws://127.0.0.1:9000';

const CONFIG_PATH = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.config'),
  'JarvisDesktop',
  'config.json',
);

// In-memory override set for the current session (updated via setJarvisWebUrl).
let _webUrlOverride = null;
let _runtimeModeOverride = null;
let _remoteRuntimeApiUrlOverride = null;
let _remoteRuntimeWsUrlOverride = null;

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/$/, '');
}

function isPackagedDesktopRuntime() {
  const hasElectron = Boolean(process.versions?.electron);
  if (!hasElectron) return false;

  const execPath = String(process.execPath || '').toLowerCase();
  return process.env.NODE_ENV === 'production' || (!process.defaultApp && !execPath.includes('electron'));
}

function readPersistedWebUrl() {
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return raw?.webUrl ? trimTrailingSlash(String(raw.webUrl)) : null;
  } catch {
    return null;
  }
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')) || {};
  } catch {
    return {};
  }
}

function writeConfig(mutator) {
  try {
    const current = readConfig();
    const next = mutator({ ...current }) || current;
    fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true });
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[runtime-config] Failed to persist config file:', err?.message || err);
  }
}

/**
 * Persist a custom server URL for the user's Jarvis installation.
 * Writes to config.json and updates the in-memory override so the change
 * takes effect immediately without restarting the app.
 * Pass null or an empty string to clear the custom URL and fall back to the default.
 */
function setJarvisWebUrl(url) {
  const normalized = url ? trimTrailingSlash(String(url)) : null;
  _webUrlOverride = normalized;
  writeConfig((current) => {
    if (normalized) {
      current.webUrl = normalized;
    } else {
      delete current.webUrl;
    }
    return current;
  });
}

function getJarvisWebUrl() {
  if (_webUrlOverride) return _webUrlOverride;
  const fromEnv = trimTrailingSlash(process.env.JARVIS_WEB_URL || process.env.JARVIS_API_URL);
  if (fromEnv) return fromEnv;
  const fromFile = readPersistedWebUrl();
  if (fromFile) return fromFile;
  return isPackagedDesktopRuntime() ? DEFAULT_PROD_WEB_URL : DEFAULT_DEV_WEB_URL;
}

function getJarvisApiUrl() {
  return trimTrailingSlash(process.env.JARVIS_API_URL || getJarvisWebUrl());
}

function getVoiceProviderMode() {
  const fromEnv = String(process.env.JARVIS_VOICE_PROVIDER_MODE || '').trim().toLowerCase();
  if (fromEnv === 'desktop-direct') return 'desktop-direct';
  return DEFAULT_VOICE_PROVIDER_MODE;
}

function isDesktopDirectVoiceEnabled() {
  return getVoiceProviderMode() === 'desktop-direct';
}

function normalizeRuntimeMode(value) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'remote-linux-runtime') return 'remote-linux-runtime';
  return DEFAULT_RUNTIME_MODE;
}

function getRuntimeMode() {
  if (_runtimeModeOverride) return _runtimeModeOverride;
  const fromEnv = normalizeRuntimeMode(process.env.JARVIS_RUNTIME_MODE || '');
  if (fromEnv !== DEFAULT_RUNTIME_MODE) return fromEnv;
  const fromFile = normalizeRuntimeMode(readConfig().runtimeMode || '');
  return fromFile || DEFAULT_RUNTIME_MODE;
}

function setRuntimeMode(mode) {
  const normalized = normalizeRuntimeMode(mode);
  _runtimeModeOverride = normalized;
  writeConfig((current) => {
    current.runtimeMode = normalized;
    return current;
  });
  return normalized;
}

function normalizeHttpUrl(url, fallback) {
  const raw = String(url || '').trim();
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return fallback;
    return trimTrailingSlash(parsed.toString());
  } catch {
    return fallback;
  }
}

function normalizeWsUrl(url, fallback) {
  const raw = String(url || '').trim();
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'ws:' && parsed.protocol !== 'wss:') return fallback;
    return trimTrailingSlash(parsed.toString());
  } catch {
    return fallback;
  }
}

function getRemoteRuntimeApiUrl() {
  if (_remoteRuntimeApiUrlOverride) return _remoteRuntimeApiUrlOverride;
  const fromEnv = normalizeHttpUrl(process.env.JARVIS_REMOTE_RUNTIME_API_URL, '');
  if (fromEnv) return fromEnv;
  return normalizeHttpUrl(readConfig().remoteRuntimeApiUrl, DEFAULT_REMOTE_RUNTIME_API_URL);
}

function setRemoteRuntimeApiUrl(url) {
  const normalized = normalizeHttpUrl(url, DEFAULT_REMOTE_RUNTIME_API_URL);
  _remoteRuntimeApiUrlOverride = normalized;
  writeConfig((current) => {
    current.remoteRuntimeApiUrl = normalized;
    return current;
  });
  return normalized;
}

function getRemoteRuntimeWsUrl() {
  if (_remoteRuntimeWsUrlOverride) return _remoteRuntimeWsUrlOverride;
  const fromEnv = normalizeWsUrl(process.env.JARVIS_REMOTE_RUNTIME_WS_URL, '');
  if (fromEnv) return fromEnv;
  return normalizeWsUrl(readConfig().remoteRuntimeWsUrl, DEFAULT_REMOTE_RUNTIME_WS_URL);
}

function setRemoteRuntimeWsUrl(url) {
  const normalized = normalizeWsUrl(url, DEFAULT_REMOTE_RUNTIME_WS_URL);
  _remoteRuntimeWsUrlOverride = normalized;
  writeConfig((current) => {
    current.remoteRuntimeWsUrl = normalized;
    return current;
  });
  return normalized;
}

module.exports = {
  getJarvisApiUrl,
  getJarvisWebUrl,
  getRemoteRuntimeApiUrl,
  getRemoteRuntimeWsUrl,
  getRuntimeMode,
  getVoiceProviderMode,
  isDesktopDirectVoiceEnabled,
  isPackagedDesktopRuntime,
  setRemoteRuntimeApiUrl,
  setRemoteRuntimeWsUrl,
  setRuntimeMode,
  setJarvisWebUrl,
};
