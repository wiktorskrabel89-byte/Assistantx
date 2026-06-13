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
const VALID_ENGINE_MODES = ['local', 'byok-cloud', 'server-free'];
const VALID_HARDWARE_PROFILES = ['eco', 'standard', 'pro'];
const VALID_LLM_TARGETS = ['local-ollama', 'local-vllm', 'cloud-provider', 'remote-server'];
const VALID_LOCAL_RUNTIMES = ['ollama', 'vllm'];
const VALID_CLOUD_PROVIDERS = ['openai', 'anthropic', 'openrouter'];
const VALID_PAIRING_STATES = ['unpaired', 'paired', 'expired'];
const VALID_STT_MODELS = ['tiny', 'base', 'small', 'medium', 'large'];
const STT_MODEL_ALIASES = {
  'whisper-tiny': 'tiny',
  'whisper-base': 'base',
  'whisper-small': 'small',
  'whisper-medium': 'medium',
  'whisper-large-v3': 'large',
  'whisper-large-v3-turbo': 'large',
};
const VALID_LOCAL_TTS_MODELS = ['kokoro', 'piper', 'auto'];

// Model matrix: hardware profile → Ollama model tag
// V2.0 — Each profile now declares a multi-model dispatch table so the
// semantic router (electron/ai/router/policy.js) can pick the right model
// per intent (chat, code, vision, routing) instead of running every prompt
// through one general LLM.
//   - eco: single small model, no specialization
//   - standard: split chat + code, share vision/router with small Qwen
//   - pro: full dual-GPU layout per the V2.0 spec — Qwen2.5-Coder 14B for
//     reasoning/code, lightweight Qwen 1.5B for fast intent classification,
//     and llava/moondream for vision
// Slots (consumed by electron/ai/router/policy.js):
//   chat       — general conversation / casual queries (general LLM)
//   code       — standard coding tasks (coder model)
//   code_heavy — complex/multi-file coding needing deeper reasoning
//   reasoning  — deep research & multi-step thinking (reasoning model)
//   router     — fast intent classification helper
//   vision     — image/screen input
// Missing/uninstalled slot models fall down the policy's SLOT_FALLBACK_CHAIN,
// so declaring a bigger model here is safe even before it is pulled.
const HARDWARE_PROFILE_MODELS = {
  eco: {
    llm: 'qwen2.5:1.5b',
    stt: 'tiny',
    tts: 'kokoro',
    dispatch: {
      chat: 'qwen2.5:1.5b',
      code: 'qwen2.5:1.5b',
      code_heavy: 'qwen2.5:1.5b',
      reasoning: 'qwen2.5:1.5b',
      router: 'qwen2.5:1.5b',
      vision: null,
    },
  },
  standard: {
    llm: 'gemma3:4b',
    stt: 'base',
    tts: 'kokoro',
    dispatch: {
      chat: 'gemma3:4b',
      code: 'qwen2.5-coder:7b',
      code_heavy: 'qwen2.5-coder:14b',
      reasoning: 'deepseek-r1:8b',
      router: 'qwen2.5:1.5b',
      vision: 'moondream2:1.4b',
    },
  },
  pro: {
    llm: 'qwen2.5:14b',
    stt: 'base',
    tts: 'kokoro',
    dispatch: {
      // General chat no longer rides the coder model — qwen2.5:14b is the
      // conversational default, with the coder reserved for code intents.
      chat: 'qwen2.5:14b',
      code: 'qwen2.5-coder:14b',
      code_heavy: 'qwen2.5-coder:32b',
      reasoning: 'deepseek-r1:14b',
      router: 'qwen2.5:3b',
      vision: 'llava-phi:2.7b',
    },
  },
};

// Legacy config path used before userData migration (kept for one-time migration).
const _LEGACY_CONFIG_PATH = path.join(
  process.env.APPDATA || path.join(os.homedir(), '.config'),
  'JarvisDesktop',
  'config.json',
);

// Resolved lazily so that app.getPath() is called after Electron is ready.
let _resolvedConfigPath = null;

function getConfigPath() {
  if (_resolvedConfigPath) return _resolvedConfigPath;
  try {
    // In the Electron main process app is always available; use its userData
    // directory so the config path is consistent regardless of how the app
    // was launched (normal user, elevated installer, etc.).
    const { app } = require('electron');
    _resolvedConfigPath = path.join(app.getPath('userData'), 'config.json');
    // One-time migration: if a config exists at the legacy path but not at the
    // new location, move it across so existing users keep their settings.
    if (!fs.existsSync(_resolvedConfigPath) && fs.existsSync(_LEGACY_CONFIG_PATH)) {
      try {
        fs.mkdirSync(path.dirname(_resolvedConfigPath), { recursive: true });
        fs.copyFileSync(_LEGACY_CONFIG_PATH, _resolvedConfigPath);
      } catch {
        // Migration failed – the app will show the wizard once to reconfigure.
      }
    }
  } catch {
    // Non-Electron context (unit tests, CLI tools): fall back to the legacy path.
    _resolvedConfigPath = _LEGACY_CONFIG_PATH;
  }
  return _resolvedConfigPath;
}

// In-memory override set for the current session (updated via setJarvisWebUrl).
let _webUrlOverride = null;
let _runtimeModeOverride = null;
let _remoteRuntimeApiUrlOverride = null;
let _remoteRuntimeWsUrlOverride = null;
let _engineModeOverride = null;

function writeConfigFile(config) {
  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}

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
    const raw = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'));
    return raw?.webUrl ? trimTrailingSlash(String(raw.webUrl)) : null;
  } catch {
    return null;
  }
}

function normalizeEngineMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'cloud') return 'byok-cloud';
  return VALID_ENGINE_MODES.includes(normalized) ? normalized : null;
}

function normalizeLlmTarget(value, engineMode = null) {
  const normalized = String(value || '').trim().toLowerCase();
  if (VALID_LLM_TARGETS.includes(normalized)) return normalized;
  if (engineMode === 'local') return 'local-ollama';
  if (engineMode === 'byok-cloud') return 'cloud-provider';
  if (engineMode === 'server-free') return 'remote-server';
  return 'local-ollama';
}

function normalizeCloudProvider(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_CLOUD_PROVIDERS.includes(normalized) ? normalized : 'openai';
}

function normalizePairingState(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return VALID_PAIRING_STATES.includes(normalized) ? normalized : 'unpaired';
}

function normalizeSttModel(value, fallback = 'base') {
  const normalized = String(value || '').trim().toLowerCase();
  if (VALID_STT_MODELS.includes(normalized)) return normalized;
  if (STT_MODEL_ALIASES[normalized]) return STT_MODEL_ALIASES[normalized];
  return String(fallback || 'base').trim().toLowerCase() || 'base';
}

function normalizeTtsModel(value, fallback = 'kokoro') {
  const normalized = String(value || '').trim().toLowerCase();
  if (VALID_LOCAL_TTS_MODELS.includes(normalized)) return normalized;
  if (normalized === 'kokoro-local') return 'kokoro';
  if (normalized === 'piper-local') return 'piper';
  if (normalized === 'auto-local') return 'auto';
  return String(fallback || 'kokoro').trim().toLowerCase() || 'kokoro';
}

function normalizeRuntimeConfig(input = {}) {
  const raw = input && typeof input === 'object' ? input : {};
  const engine_mode = normalizeEngineMode(raw.engine_mode);
  const llm_target = normalizeLlmTarget(raw.llm_target, engine_mode);
  const local = raw.local && typeof raw.local === 'object' ? raw.local : {};
  const cloud = raw.cloud && typeof raw.cloud === 'object' ? raw.cloud : {};
  const server = raw.server && typeof raw.server === 'object' ? raw.server : {};

  const profile = normalizeHardwareProfile(local.hardware_profile || raw.hardware_profile);
  const defaults = HARDWARE_PROFILE_MODELS[profile];
  const localRuntime = VALID_LOCAL_RUNTIMES.includes(String(local.runtime || '').toLowerCase())
    ? String(local.runtime || '').toLowerCase()
    : 'ollama';
  const cloudProvider = normalizeCloudProvider(cloud.provider || raw.legacy_provider || raw.cloud_provider);
  const keyAlias = String(cloud.key_alias || `jarvis-byok-${cloudProvider}-key`).trim();

  const normalized = {
    ...raw,
    engine_mode,
    llm_target,
    local: {
      runtime: localRuntime,
      hardware_profile: profile,
      manifest: {
        router_model: String(local?.manifest?.router_model || raw.llm_model || defaults.llm).trim() || defaults.llm,
        coder_model: String(local?.manifest?.coder_model || raw.llm_model || defaults.llm).trim() || defaults.llm,
        vl_model: String(local?.manifest?.vl_model || raw.llm_model || defaults.llm).trim() || defaults.llm,
        embedding_model: String(local?.manifest?.embedding_model || 'nomic-embed-text').trim() || 'nomic-embed-text',
      },
    },
    cloud: {
      provider: cloudProvider,
      model_router: String(cloud.model_router || raw.llm_model || defaults.llm).trim() || defaults.llm,
      model_executor: String(cloud.model_executor || raw.llm_model || defaults.llm).trim() || defaults.llm,
      key_alias: keyAlias || `jarvis-byok-${cloudProvider}-key`,
      fallback_provider_order: Array.isArray(cloud.fallback_provider_order)
        ? cloud.fallback_provider_order.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean)
        : [cloudProvider],
      token_limit_per_task: Number.isFinite(cloud.token_limit_per_task)
        ? Number(cloud.token_limit_per_task)
        : 120000,
    },
    server: {
      remoteRuntimeApiUrl: normalizeHttpUrl(server.remoteRuntimeApiUrl || raw.remoteRuntimeApiUrl, DEFAULT_REMOTE_RUNTIME_API_URL),
      remoteRuntimeWsUrl: normalizeWsUrl(server.remoteRuntimeWsUrl || raw.remoteRuntimeWsUrl, DEFAULT_REMOTE_RUNTIME_WS_URL),
      accountId: String(server.accountId || '').trim(),
      pairing_state: normalizePairingState(server.pairing_state),
    },
  };

  normalized.hardware_profile = profile;
  normalized.language = String(raw.language || 'en').trim() || 'en';
  normalized.stt_model = normalizeSttModel(raw.stt_model, defaults.stt);
  normalized.llm_model = String(raw.llm_model || defaults.llm).trim() || defaults.llm;
  normalized.tts_model = normalizeTtsModel(raw.tts_model, defaults.tts);
  // Vision model: explicit value, else profile default from dispatch table, else null.
  // Routes used by the AI router (router/index.js) for profile === 'vision' intents.
  normalized.vision_model = raw.vision_model
    ? String(raw.vision_model).trim() || (defaults.dispatch?.vision || null)
    : (defaults.dispatch?.vision || null);
  normalized.remoteRuntimeApiUrl = normalized.server.remoteRuntimeApiUrl;
  normalized.remoteRuntimeWsUrl = normalized.server.remoteRuntimeWsUrl;
  return normalized;
}

function migrateLegacyConfig(input = {}) {
  const source = input && typeof input === 'object' ? input : {};
  const migrated = normalizeRuntimeConfig(source);
  let changed = false;
  if (String(source.engine_mode || '').trim().toLowerCase() === 'cloud') changed = true;
  if (source.llm_target !== migrated.llm_target) changed = true;
  if (source.engine_mode !== migrated.engine_mode) changed = true;
  if (!source.local || !source.cloud || !source.server) changed = true;
  return { config: migrated, changed };
}

function readConfig() {
  try {
    const raw = JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8')) || {};
    const { config, changed } = migrateLegacyConfig(raw);
    if (changed) writeConfigFile(config);
    return config;
  } catch {
    return {};
  }
}

function writeConfig(mutator) {
  try {
    const current = readConfig();
    const next = mutator({ ...current }) || current;
    writeConfigFile(normalizeRuntimeConfig(next));
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
  const cfg = readConfig();
  return normalizeHttpUrl(cfg?.server?.remoteRuntimeApiUrl || cfg.remoteRuntimeApiUrl, DEFAULT_REMOTE_RUNTIME_API_URL);
}

function setRemoteRuntimeApiUrl(url) {
  const normalized = normalizeHttpUrl(url, DEFAULT_REMOTE_RUNTIME_API_URL);
  _remoteRuntimeApiUrlOverride = normalized;
  writeConfig((current) => {
    current.server = current.server && typeof current.server === 'object' ? current.server : {};
    current.server.remoteRuntimeApiUrl = normalized;
    current.remoteRuntimeApiUrl = normalized;
    return current;
  });
  return normalized;
}

function getRemoteRuntimeWsUrl() {
  if (_remoteRuntimeWsUrlOverride) return _remoteRuntimeWsUrlOverride;
  const fromEnv = normalizeWsUrl(process.env.JARVIS_REMOTE_RUNTIME_WS_URL, '');
  if (fromEnv) return fromEnv;
  const cfg = readConfig();
  return normalizeWsUrl(cfg?.server?.remoteRuntimeWsUrl || cfg.remoteRuntimeWsUrl, DEFAULT_REMOTE_RUNTIME_WS_URL);
}

function setRemoteRuntimeWsUrl(url) {
  const normalized = normalizeWsUrl(url, DEFAULT_REMOTE_RUNTIME_WS_URL);
  _remoteRuntimeWsUrlOverride = normalized;
  writeConfig((current) => {
    current.server = current.server && typeof current.server === 'object' ? current.server : {};
    current.server.remoteRuntimeWsUrl = normalized;
    current.remoteRuntimeWsUrl = normalized;
    return current;
  });
  return normalized;
}

/**
 * Returns the configured engine mode ('local' | 'byok-cloud' | 'server-free') or null if the
 * first-run wizard has not been completed yet.
 * Priority: in-memory override → env var → config file → null
 */
function getEngineMode() {
  if (_engineModeOverride) return _engineModeOverride;
  const fromEnv = normalizeEngineMode(process.env.JARVIS_ENGINE_MODE || '');
  if (fromEnv) return fromEnv;
  const fromFile = normalizeEngineMode(readConfig().engine_mode || '');
  if (fromFile) return fromFile;
  return null;
}

/**
 * Persist the engine mode selection.  Updates in-memory override immediately.
 */
function setEngineMode(mode) {
  const normalized = normalizeEngineMode(mode);
  if (!normalized) {
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
  const cfg = normalizeRuntimeConfig(readConfig());
  const profile = normalizeHardwareProfile(cfg.local?.hardware_profile || cfg.hardware_profile);
  const defaults = HARDWARE_PROFILE_MODELS[profile];
  return {
    engine_mode: getEngineMode(),
    llm_target: cfg.llm_target,
    hardware_profile: profile,
    language: String(cfg.language || 'en').trim() || 'en',
    stt_model: String(cfg.stt_model || defaults.stt).trim() || defaults.stt,
    llm_model: String(cfg.llm_model || defaults.llm).trim() || defaults.llm,
    tts_model: String(cfg.tts_model || defaults.tts).trim() || defaults.tts,
    // V2.0: tier-aware multi-model dispatch table consumed by the semantic
    // router. Always exposes a complete dispatch object even if the persisted
    // profile predates the V2.0 schema (defaults backfill missing slots).
    // Wizard-selected models override the profile defaults where they apply:
    // llm_model → chat slot, vision_model → vision slot.
    dispatch: {
      chat: String(cfg.llm_model || '').trim() || defaults.dispatch?.chat || defaults.llm,
      code: defaults.dispatch?.code || defaults.llm,
      code_heavy: defaults.dispatch?.code_heavy || defaults.dispatch?.code || defaults.llm,
      reasoning: defaults.dispatch?.reasoning || defaults.dispatch?.code || defaults.llm,
      router: defaults.dispatch?.router || defaults.llm,
      vision: String(cfg.vision_model || '').trim() || defaults.dispatch?.vision || null,
    },
    local: cfg.local,
    cloud: cfg.cloud,
    server: cfg.server,
  };
}

/**
 * Persist the full Jarvis OS model configuration (written by the Setup Wizard).
 * Also sets the engine_mode in-memory override so it takes effect immediately.
 */
function setJarvisModelConfig({
  engine_mode,
  llm_target,
  hardware_profile,
  language,
  stt_model,
  llm_model,
  tts_model,
  vision_model,
  local,
  cloud,
  server,
} = {}) {
  const normalizedMode = normalizeEngineMode(engine_mode);
  if (!normalizedMode) {
    throw new Error(`Invalid engine_mode '${normalizedMode}'.`);
  }
  const normalizedProfile = normalizeHardwareProfile(hardware_profile);
  const defaults = HARDWARE_PROFILE_MODELS[normalizedProfile];
  const defaultVision = defaults.dispatch?.vision || null;
  const config = normalizeRuntimeConfig({
    engine_mode: normalizedMode,
    llm_target: normalizeLlmTarget(llm_target, normalizedMode),
    hardware_profile: normalizedProfile,
    language: String(language || 'en').trim() || 'en',
    stt_model: String(stt_model || defaults.stt).trim() || defaults.stt,
    llm_model: String(llm_model || defaults.llm).trim() || defaults.llm,
    tts_model: String(tts_model || defaults.tts).trim() || defaults.tts,
    vision_model: vision_model === undefined
      ? defaultVision
      : (String(vision_model || '').trim() || defaultVision),
    local,
    cloud,
    server,
  });
  _engineModeOverride = normalizedMode;
  writeConfig((current) => Object.assign(current, config));
  return config;
}

function getRuntimeConfig() {
  return normalizeRuntimeConfig(readConfig());
}

function setRuntimeConfig(nextConfig = {}) {
  const current = getRuntimeConfig();
  const next = normalizeRuntimeConfig({ ...current, ...(nextConfig || {}) });
  _engineModeOverride = next.engine_mode;
  writeConfig(() => next);
  return next;
}

function normalizeJarvisCodeConfig(value) {
  const raw = value && typeof value === 'object' ? value : {};
  return {
    enabled: Boolean(raw.enabled),
    difficulty_auto_detect: raw.difficulty_auto_detect !== false,
    use_7_agent_tasking: Boolean(raw.use_7_agent_tasking),
    release_requires_approval: raw.release_requires_approval !== false,
    free_solo_agent: raw.free_solo_agent !== false,
    trusted_workspace_directories: Array.isArray(raw.trusted_workspace_directories)
      ? raw.trusted_workspace_directories.map((entry) => String(entry || '').trim()).filter(Boolean)
      : [],
  };
}

function getJarvisCodeConfig() {
  const cfg = readConfig();
  return normalizeJarvisCodeConfig(cfg.jarvis_code);
}

function setJarvisCodeConfig(input = {}) {
  const next = normalizeJarvisCodeConfig(input);
  writeConfig((current) => {
    current.jarvis_code = next;
    return current;
  });
  return next;
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
  getJarvisCodeConfig,
  setJarvisCodeConfig,
  getRuntimeConfig,
  setRuntimeConfig,
  HARDWARE_PROFILE_MODELS,
  VALID_ENGINE_MODES,
  VALID_HARDWARE_PROFILES,
  VALID_LLM_TARGETS,
};
