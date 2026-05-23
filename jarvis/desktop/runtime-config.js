const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_DEV_WEB_URL = 'http://localhost:3000';
const DEFAULT_PROD_WEB_URL = 'https://assistantx.pl';
const DEFAULT_VOICE_PROVIDER_MODE = 'assistantx-server';
const DEFAULT_RUNTIME_MODE = 'local-desktop';
const DEFAULT_REMOTE_RUNTIME_API_URL = 'http://127.0.0.1:9001';
const DEFAULT_REMOTE_RUNTIME_WS_URL = 'ws://127.0.0.1:9000';

// ── Jarvis OS engine defaults ─────────────────────────────────────────────────
const VALID_ENGINE_MODES = ['local', 'cloud'];
const VALID_HARDWARE_PROFILES = ['eco', 'standard', 'pro'];

// Model matrix: hardware profile → Ollama model tag
const HARDWARE_PROFILE_MODELS = {
  eco: { llm: 'qwen2.5:1.5b', stt: 'tiny', tts: 'kokoro' },
  standard: { llm: 'gemma3:4b', stt: 'base', tts: 'kokoro' },
  pro: { llm: 'qwen2.5:7b', stt: 'base', tts: 'kokoro' },
};

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
let _engineModeOverride = null;

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

/**
 * Returns the configured engine mode ('local' | 'cloud') or null if the
 * first-run wizard has not been completed yet.
 * Priority: in-memory override → env var → config file → null
 */
function getEngineMode() {
  if (_engineModeOverride) return _engineModeOverride;
  const fromEnv = String(process.env.JARVIS_ENGINE_MODE || '').trim().toLowerCase();
  if (VALID_ENGINE_MODES.includes(fromEnv)) return fromEnv;
  const fromFile = String(readConfig().engine_mode || '').trim().toLowerCase();
  if (VALID_ENGINE_MODES.includes(fromFile)) return fromFile;
  return null;
}

/**
 * Persist the engine mode selection.  Updates in-memory override immediately.
 */
function setEngineMode(mode) {
  const normalized = String(mode || '').trim().toLowerCase();
  if (!VALID_ENGINE_MODES.includes(normalized)) {
    throw new Error(`Invalid engine_mode '${normalized}'. Must be one of: ${VALID_ENGINE_MODES.join(', ')}`);
  }
  _engineModeOverride = normalized;
  writeConfig((current) => {
    current.engine_mode = normalized;
    return current;
  });
  return normalized;
}

/**
 * Validate and return a hardware profile string.
 */
function normalizeHardwareProfile(value) {
  const normalized = String(value || 'standard').trim().toLowerCase();
  return VALID_HARDWARE_PROFILES.includes(normalized) ? normalized : 'standard';
}

/**
 * Returns the full model configuration object for the Jarvis OS engine,
 * merging persisted config with per-profile defaults.
 */
function getJarvisModelConfig() {
  const cfg = readConfig();
  const profile = normalizeHardwareProfile(cfg.hardware_profile);
  const defaults = HARDWARE_PROFILE_MODELS[profile];
  return {
    engine_mode: getEngineMode(),
    hardware_profile: profile,
    language: String(cfg.language || 'en').trim() || 'en',
    stt_model: String(cfg.stt_model || defaults.stt).trim() || defaults.stt,
    llm_model: String(cfg.llm_model || defaults.llm).trim() || defaults.llm,
    tts_model: String(cfg.tts_model || defaults.tts).trim() || defaults.tts,
  };
}

/**
 * Persist the full Jarvis OS model configuration (written by the Setup Wizard).
 * Also sets the engine_mode in-memory override so it takes effect immediately.
 */
function setJarvisModelConfig({ engine_mode, hardware_profile, language, stt_model, llm_model, tts_model } = {}) {
  const normalizedMode = String(engine_mode || '').trim().toLowerCase();
  if (!VALID_ENGINE_MODES.includes(normalizedMode)) {
    throw new Error(`Invalid engine_mode '${normalizedMode}'.`);
  }
  const normalizedProfile = normalizeHardwareProfile(hardware_profile);
  const defaults = HARDWARE_PROFILE_MODELS[normalizedProfile];
  const config = {
    engine_mode: normalizedMode,
    hardware_profile: normalizedProfile,
    language: String(language || 'en').trim() || 'en',
    stt_model: String(stt_model || defaults.stt).trim() || defaults.stt,
    llm_model: String(llm_model || defaults.llm).trim() || defaults.llm,
    tts_model: String(tts_model || defaults.tts).trim() || defaults.tts,
  };
  _engineModeOverride = normalizedMode;
  writeConfig((current) => Object.assign(current, config));
  return config;
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
  getEngineMode,
  setEngineMode,
  getJarvisModelConfig,
  setJarvisModelConfig,
  HARDWARE_PROFILE_MODELS,
  VALID_ENGINE_MODES,
  VALID_HARDWARE_PROFILES,
};
