'use strict';

const { analyzeRequest } = require('./analyzer');
const { decideRoute } = require('./policy');
const { OllamaProvider } = require('../providers/ollama');
const { CloudApiProvider } = require('../providers/cloud-api');
const { OpenAICompatProvider } = require('../providers/openai-compat');
const {
  pickBestFreeModel,
  DEFAULT_FREE_CHAT_MODEL,
  DEFAULT_FREE_CODING_MODEL,
} = require('../free-model-catalog');

// ── Hardware profile → Ollama model matrix ────────────────────────────────────
// Mirrors HARDWARE_PROFILE_MODELS in runtime-config.js.
const HARDWARE_PROFILE_CHAT_MODEL = {
  eco:      'qwen2.5:1.5b',
  standard: 'gemma3:4b',
  pro:      'qwen2.5:7b',
};

const ROUTING_PROFILES = {
  chat: {
    local: 'gemma3:4b',
  },
  coding: {
    local: 'qwen2.5-coder:14b',
  },
  tool: {
    local: 'qwen2.5-coder:14b',
  },
};

// Cloud mode: DeepSeek-V3 via Groq kept as a named constant for external callers.
const CLOUD_DEEPSEEK_MODEL = 'deepseek-chat';
const CLOUD_DEEPSEEK_PROVIDER = 'groq';

const REQUIRED_LOCAL_MODELS = ['gemma3:4b', 'qwen2.5-coder:14b'];
const DEFAULT_CLOUD_PROVIDER_ORDER = ['groq', 'openrouter'];
const TASK_DIFFICULTY_MODELS = {
  1: { primary: { provider: 'google', model: 'gemini-2.5-flash' }, fallback: { provider: 'groq', model: 'llama-3.1-8b-instant' } },
  2: { primary: { provider: 'groq', model: 'llama-3.3-70b-versatile' }, fallback: { provider: 'google', model: 'gemini-2.0-flash' } },
  3: { primary: { provider: 'google', model: 'gemini-2.5-pro' }, fallback: { provider: 'groq', model: 'llama-3.3-70b-versatile' } },
  4: { primary: { provider: 'openrouter', model: 'deepseek/deepseek-r1:free' }, fallback: { provider: 'google', model: 'gemini-2.5-pro' } },
  5: { primary: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-r1:free' } },
 };

class AIRouter {
  constructor(options = {}) {
    this.ollama = options.ollama || new OllamaProvider(options.ollamaConfig || {});
    this.cloud = options.cloud || new CloudApiProvider(options.cloudConfig || {});
    this.getLocalServerConfig = typeof options.getLocalServerConfig === 'function' ? options.getLocalServerConfig : null;
    this.requiredModels = Array.isArray(options.requiredModels) && options.requiredModels.length > 0
      ? options.requiredModels
      : REQUIRED_LOCAL_MODELS;
    this.cloudProviderOrder = normalizeProviderOrder(
      options.cloudProviderOrder || process.env.JARVIS_CLOUD_PROVIDER_ORDER || DEFAULT_CLOUD_PROVIDER_ORDER,
    );
    // Engine mode and hardware profile injected from runtime-config
    this._engineMode = typeof options.getEngineMode === 'function' ? options.getEngineMode : () => null;
    this._modelConfig = typeof options.getModelConfig === 'function' ? options.getModelConfig : () => null;
  }

  async getAvailability() {
    const localConfig = this.getLocalServerConfig ? this.getLocalServerConfig() : null;
    const localServers = Array.isArray(localConfig?.localServers) ? localConfig.localServers : [];
    const enabledLocalServers = localServers.filter((server) => server?.enabled);
    const localServerStates = await Promise.all(enabledLocalServers.map(async (server) => {
      const provider = createLocalProvider(server);
      const healthy = await provider.isHealthy();
      const installedModels = healthy ? await provider.listModels() : [];
      return {
        id: String(server.id || ''),
        label: String(server.label || 'Local server'),
        baseUrl: String(server.baseUrl || ''),
        apiType: server.apiType,
        healthy,
        installedModels,
      };
    }));
    const ollamaHealth = await this.ollama.getHealth(this.requiredModels);
    const cloudReadiness = await this.cloud.getReadiness();
    const ollamaAvailable = Boolean(ollamaHealth.healthy && ollamaHealth.requiredModelsPresent);
    const anyLocalServerAvailable = localServerStates.some((server) => server.healthy && server.installedModels.length > 0);
    return {
      ollama_available: Boolean(ollamaAvailable || anyLocalServerAvailable),
      ollama_healthy: Boolean(ollamaHealth.healthy),
      required_models: ollamaHealth.requiredModels,
      installed_models: ollamaHealth.installedModels,
      missing_models: ollamaHealth.missingModels,
      required_models_present: ollamaHealth.requiredModelsPresent,
      local_servers: localServerStates,
      cloud: cloudReadiness,
      cloud_provider_order: this.cloudProviderOrder,
      mode: ollamaAvailable || anyLocalServerAvailable ? 'local' : 'cloud-fallback',
    };
  }

  async routeRequest(request = {}, onChunk = () => {}) {
    const engineMode = this._engineMode();
    const modelConfig = this._modelConfig();
    const profile = normalizeProfile(request?.profile || inferProfile(request));
    const analysis = analyzeRequest({
      message: request?.message || extractLastMessage(request?.messages),
      contextSize: request?.contextSize,
      codingDepth: request?.contextType === 'code' ? 'architecture' : request?.codingDepth,
      retryCount: request?.retryCount || 0,
      confidence: request?.confidence,
    });
    const availability = await this.getAvailability();
    const localConfig = this.getLocalServerConfig ? this.getLocalServerConfig() : null;
    const localRoute = resolveConfiguredLocalRoute(localConfig, profile, availability);

    // ── Engine-mode overrides ─────────────────────────────────────────────────
    // cloud mode: pick the best free model for the user's plan and profile
    if (engineMode === 'cloud') {
      const difficulty = detectTaskDifficulty(request);
      const registryChoice = TASK_DIFFICULTY_MODELS[difficulty] || TASK_DIFFICULTY_MODELS[2];
      const plan = String(modelConfig?.plan || 'pro').toLowerCase();
      const candidate = pickBestFreeModel(profile === 'coding' ? 'coding' : 'chat', plan)
        || (profile === 'coding' ? DEFAULT_FREE_CODING_MODEL : DEFAULT_FREE_CHAT_MODEL);
      const cloudProvider = modelConfig?.provider || registryChoice.primary.provider || candidate.provider;
      const cloudModel = modelConfig?.llm_model || registryChoice.primary.model || candidate.model;
      const resolvedRequest = {
        ...request,
        messages: normalizeMessages(request),
        model: cloudModel,
        provider: cloudProvider,
        options: { temperature: 0.7, ...(request.options || {}) },
      };
      const response = await this.cloud.stream(resolvedRequest, onChunk);
      return { ...response, route: { provider: cloudProvider, model: cloudModel, reason: `engine-mode-cloud-difficulty-${difficulty}` }, profile, availability };
    }

    // local mode: override chat model based on hardware profile
    const profileChatModel = modelConfig?.hardware_profile
      ? (HARDWARE_PROFILE_CHAT_MODEL[modelConfig.hardware_profile] || ROUTING_PROFILES.chat.local)
      : ROUTING_PROFILES.chat.local;
    const route = decideRoute(analysis, {
      availability,
      profile,
      cloudProviderOrder: this.cloudProviderOrder,
    });
    // Apply hardware-profile model when routing locally for chat
    if (route.provider === 'ollama' && profile === 'chat') {
      route.model = profileChatModel;
    }
    const effectiveRoute = localRoute || route;
    const resolvedRequest = {
      ...request,
      messages: normalizeMessages(request),
      model: effectiveRoute.model,
      provider: effectiveRoute.provider,
      options: {
        temperature: effectiveRoute.reason === 'escalation' ? 0.2 : 0.7,
        ...(request.options || {}),
      },
      keepAlive: effectiveRoute.keepAlive,
    };

    if (effectiveRoute.provider === 'ollama' && availability.ollama_available) {
      const provider = localRoute?.server ? createLocalProvider(localRoute.server) : this.ollama;
      const response = await provider.stream(resolvedRequest, onChunk);
      return {
        ...response,
        route: effectiveRoute,
        profile,
        availability,
      };
    }

    if (effectiveRoute.provider === 'openai-compat' && localRoute?.server) {
      const provider = createLocalProvider(localRoute.server);
      const response = await provider.stream(resolvedRequest, onChunk);
      return {
        ...response,
        route: effectiveRoute,
        profile,
        availability,
      };
    }

    const response = await this.cloud.stream({
      ...resolvedRequest,
      provider: effectiveRoute.provider,
      model: effectiveRoute.model,
    }, onChunk);
    return {
      ...response,
      route: effectiveRoute,
      profile,
      availability,
    };
  }
}

function extractLastMessage(messages) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  const last = messages[messages.length - 1];
  return String(last?.content || '');
}

function normalizeMessages(request = {}) {
  if (Array.isArray(request.messages) && request.messages.length > 0) {
    return request.messages.map((entry) => ({
      role: String(entry?.role || 'user'),
      content: String(entry?.content || ''),
    }));
  }
  return [{ role: 'user', content: String(request.message || '') }];
}

function inferProfile(request = {}) {
  const explicitContext = String(request?.contextType || '').toLowerCase();
  if (explicitContext === 'code') return 'coding';
  if (explicitContext === 'tool') return 'tool';
  const content = `${request?.message || ''} ${extractLastMessage(request?.messages)}`.toLowerCase();
  if (/(code|refactor|debug|architecture|typescript|python|javascript|sql)/i.test(content)) return 'coding';
  if (/(search|tool|web|browser|retrieve|memory)/i.test(content)) return 'tool';
  return 'chat';
}

function detectTaskDifficulty(request = {}) {
  const text = `${request?.message || ''} ${extractLastMessage(request?.messages)}`.toLowerCase();
  if (/(microservice|autonomous|multi-agent|7-agent|full stack|from scratch)/i.test(text)) return 5;
  if (/(memory leak|reasoning|algorithm|deep debug|incident|critical bug)/i.test(text)) return 4;
  if (/(refactor|migration|database optimization|state machine|rewrite)/i.test(text)) return 3;
  if (/(endpoint|component|feature|function|api)/i.test(text)) return 2;
  return 1;
}

function normalizeProfile(profile) {
  const normalized = String(profile || '').toLowerCase().trim();
  if (normalized === 'coding' || normalized === 'tool') return normalized;
  return 'chat';
}

function normalizeProviderOrder(input) {
  const values = Array.isArray(input) ? input : String(input || '').split(',');
  const normalized = values
    .map((item) => String(item || '').toLowerCase().trim())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
  return normalized.length > 0 ? normalized : [...DEFAULT_CLOUD_PROVIDER_ORDER];
}

function createLocalProvider(server) {
  const apiType = String(server?.apiType || 'ollama');
  const baseUrl = String(server?.baseUrl || '');
  if (apiType === 'ollama') return new OllamaProvider({ baseUrl });
  return new OpenAICompatProvider({ baseUrl });
}

function resolveConfiguredLocalRoute(localConfig, profile, availability) {
  if (!localConfig || typeof localConfig !== 'object') return null;
  const assignment = localConfig.localModelAssignment || {};
  const serverId = assignment.serverId ? String(assignment.serverId) : '';
  if (!serverId) return null;
  const roleModelId = profile === 'coding'
    ? assignment.codeModelId
    : profile === 'tool'
      ? assignment.externalApiModelId
      : assignment.chatModelId;
  if (!roleModelId) return null;
  const server = Array.isArray(localConfig.localServers)
    ? localConfig.localServers.find((entry) => entry?.id === serverId && entry?.enabled)
    : null;
  if (!server) return null;
  const scannedState = Array.isArray(availability?.local_servers)
    ? availability.local_servers.find((entry) => entry?.id === serverId)
    : null;
  const availableModels = Array.isArray(scannedState?.installedModels) ? scannedState.installedModels : [];
  if (!availableModels.includes(String(roleModelId))) return null;
  return {
    provider: server.apiType === 'ollama' ? 'ollama' : 'openai-compat',
    model: String(roleModelId),
    keepAlive: null,
    reason: 'configured-local-model',
    profile,
    server,
  };
}

module.exports = {
  AIRouter,
  ROUTING_PROFILES,
  REQUIRED_LOCAL_MODELS,
  DEFAULT_CLOUD_PROVIDER_ORDER,
  HARDWARE_PROFILE_CHAT_MODEL,
  CLOUD_DEEPSEEK_MODEL,
  CLOUD_DEEPSEEK_PROVIDER,
};
