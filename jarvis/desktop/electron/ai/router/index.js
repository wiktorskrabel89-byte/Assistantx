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
// Mirrors HARDWARE_PROFILE_MODELS in runtime-config.js. Chat profiles map to
// *general* LLMs — the coder model is reserved for code intents (the old
// matrix pinned chat to qwen2.5-coder:14b, which made the coding model handle
// every conversation).
const HARDWARE_PROFILE_CHAT_MODEL = {
  eco:      'qwen2.5:1.5b',
  standard: 'gemma3:4b',
  pro:      'qwen2.5:14b',
};

const ROUTING_PROFILES = {
  chat: {
    local: 'gemma3:4b',
  },
  coding: {
    local: 'qwen2.5-coder:14b',
  },
  tool: {
    local: 'gemma3:4b',
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
    const requestStartedAt = Date.now();
    let firstTokenAt = null;
    const onChunkWithMetrics = (event) => {
      if (!firstTokenAt && event?.type === 'token') {
        firstTokenAt = Date.now();
      }
      onChunk(event);
    };
    const engineMode = this._engineMode();
    const modelConfig = this._modelConfig();
    const profile = normalizeProfile(request?.profile || inferProfile(request));
    const images = Array.isArray(request?.images)
      ? request.images.map((item) => String(item || '')).filter(Boolean)
      : [];
    const analysis = analyzeRequest({
      message: request?.message || extractLastMessage(request?.messages),
      contextSize: request?.contextSize,
      codingDepth: request?.contextType === 'code' ? 'architecture' : request?.codingDepth,
      retryCount: request?.retryCount || 0,
      confidence: request?.confidence,
      source: request?.source,
      images,
    });
    const availability = await this.getAvailability();
    const localConfig = this.getLocalServerConfig ? this.getLocalServerConfig() : null;
    const localRoute = resolveConfiguredLocalRoute(localConfig, profile, availability);

    // ── Engine-mode overrides ─────────────────────────────────────────────────
    // cloud mode: pick the best free model for the user's plan and profile
    if (engineMode === 'cloud' || engineMode === 'byok-cloud') {
      const difficulty = detectTaskDifficulty(request);
      const registryChoice = TASK_DIFFICULTY_MODELS[difficulty] || TASK_DIFFICULTY_MODELS[2];
      const plan = String(modelConfig?.plan || 'pro').toLowerCase();
      const candidate = pickBestFreeModel(profile === 'coding' ? 'coding' : 'chat', plan)
        || (profile === 'coding' ? DEFAULT_FREE_CODING_MODEL : DEFAULT_FREE_CHAT_MODEL);
      const cloudProvider = modelConfig?.provider || registryChoice.primary.provider || candidate.provider;
      const cloudModel = profile === 'vision'
        ? (modelConfig?.vision_model || registryChoice.primary.model || candidate.model)
        : (modelConfig?.llm_model || registryChoice.primary.model || candidate.model);
      const resolvedRequest = {
        ...request,
        messages: normalizeMessages(request),
        model: cloudModel,
        provider: cloudProvider,
        options: {
          ...(request.options || {}),
          temperature: request.options?.temperature ?? inferAutoTemperature({ request, profile, analysis, difficulty }),
        },
      };
      let response;
      try {
        response = await this.cloud.stream(resolvedRequest, onChunkWithMetrics);
      } catch (err) {
        const isAuth = err?.status === 401 || /401|unauthorized|forbidden/i.test(err?.message || '');
        err.userMessage = isAuth
          ? 'Sign in required — go to Settings → Account to log in.'
          : `Cloud AI request failed: ${err?.message || 'unknown error'}`;
        throw err;
      }
      return {
        ...response,
        route: { provider: cloudProvider, model: cloudModel, reason: `engine-mode-cloud-difficulty-${difficulty}` },
        profile,
        availability,
        metrics: buildRouteMetrics({ requestStartedAt, firstTokenAt, request }),
      };
    }

    // local mode: override chat model based on hardware profile
    const profileChatModel = modelConfig?.hardware_profile
      ? (HARDWARE_PROFILE_CHAT_MODEL[modelConfig.hardware_profile] || ROUTING_PROFILES.chat.local)
      : ROUTING_PROFILES.chat.local;
    // V2.0 tier-aware dispatch — pass the live dispatch table from the
    // hardware profile so the semantic policy picks the right model per intent.
    const route = decideRoute(analysis, {
      availability,
      profile,
      cloudProviderOrder: this.cloudProviderOrder,
      dispatch: modelConfig?.dispatch,
    });
    // Legacy override: keep chat-profile pinning for backwards compatibility
    // with the V1.0 hardware profile chat models when no dispatch table exists.
    if (!modelConfig?.dispatch && route.provider === 'ollama' && profile === 'chat') {
      route.model = profileChatModel;
    }
    const effectiveRoute = localRoute || route;
    const resolvedRequest = {
      ...request,
      messages: normalizeMessages(request),
      images,
      model: effectiveRoute.model,
      provider: effectiveRoute.provider,
      options: {
        ...(request.options || {}),
        temperature: request.options?.temperature ?? inferAutoTemperature({
          request,
          profile,
          analysis,
          route: effectiveRoute,
        }),
      },
      keepAlive: effectiveRoute.keepAlive,
    };

    if (effectiveRoute.provider === 'ollama' && availability.ollama_available) {
      const provider = localRoute?.server ? createLocalProvider(localRoute.server) : this.ollama;

      // Vision → LLM relay: the vision model describes the image, then the
      // text model (chat or coder, per secondary intent) produces the actual
      // answer with that description as grounded context.
      if (effectiveRoute.relay && images.length > 0) {
        const description = await provider.generate({
          model: effectiveRoute.model,
          messages: [{
            role: 'user',
            content: 'Describe this image precisely for another assistant: '
              + 'layout, visible text, UI elements, code, and anything unusual. '
              + `The user's request about it is: "${request?.message || extractLastMessage(request?.messages)}"`,
          }],
          images,
          options: { temperature: 0.2 },
        });
        const relayRequest = {
          ...resolvedRequest,
          images: [],
          model: effectiveRoute.relay.model,
          messages: [
            ...normalizeMessages(request).slice(0, -1),
            {
              role: 'user',
              content: `${request?.message || extractLastMessage(request?.messages)}\n\n`
                + `[Vision model's description of the attached image]\n${String(description?.text || '').trim()}`,
            },
          ],
        };
        const relayResponse = await provider.stream(relayRequest, onChunkWithMetrics);
        return {
          ...relayResponse,
          route: {
            ...effectiveRoute,
            model: effectiveRoute.relay.model,
            lane: effectiveRoute.relay.slot,
            reason: `${effectiveRoute.reason}-relay-vision-to-${effectiveRoute.relay.intent}`,
            visionModel: effectiveRoute.model,
          },
          profile,
          availability,
          metrics: buildRouteMetrics({ requestStartedAt, firstTokenAt, request }),
        };
      }

      const response = await provider.stream(resolvedRequest, onChunkWithMetrics);
      return {
        ...response,
        route: effectiveRoute,
        profile,
        availability,
        metrics: buildRouteMetrics({ requestStartedAt, firstTokenAt, request }),
      };
    }

    if (effectiveRoute.provider === 'openai-compat' && localRoute?.server) {
      const provider = createLocalProvider(localRoute.server);
      const response = await provider.stream(resolvedRequest, onChunkWithMetrics);
      return {
        ...response,
        route: effectiveRoute,
        profile,
        availability,
        metrics: buildRouteMetrics({ requestStartedAt, firstTokenAt, request }),
      };
    }

    const response = await this.cloud.stream({
      ...resolvedRequest,
      provider: effectiveRoute.provider,
      model: effectiveRoute.model,
    }, onChunkWithMetrics);
    return {
      ...response,
      route: effectiveRoute,
      profile,
      availability,
      metrics: buildRouteMetrics({ requestStartedAt, firstTokenAt, request }),
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
  if (explicitContext === 'vision') return 'vision';
  if (explicitContext === 'tool') return 'tool';
  const content = `${request?.message || ''} ${extractLastMessage(request?.messages)}`.toLowerCase();
  if (/(screenshot|screen shot|what(?:'s| is)? on (?:my |the )?screen|describe (?:my |the )?screen|look at (?:my |the )?screen|image|picture|photo|ocr)/i.test(content)) return 'vision';
  if (/(code|refactor|debug|architecture|typescript|python|javascript|sql)/i.test(content)) return 'coding';
  if (/(search|tool|web|browser|retrieve|memory)/i.test(content)) return 'tool';
  return 'chat';
}

function inferAutoTemperature({ request = {}, profile = 'chat', analysis = {}, difficulty = null, route = null } = {}) {
  const text = `${request?.message || ''} ${extractLastMessage(request?.messages)}`.toLowerCase();
  if (profile === 'coding' || analysis.intent === 'code') return 0.22;
  if (profile === 'vision' || analysis.intent === 'vision') return 0.35;
  if (route?.reason && /escalated|escalation/i.test(route.reason)) return 0.25;
  if (Number(difficulty || 0) >= 4 || analysis.complexity === 'hard') return 0.3;
  if (/(brainstorm|creative|ideas|story|name|marketing|write a fun|warianty|pomys[lł])/i.test(text)) return 0.82;
  if (/(summarize|extract|classify|compare|translate|polish|fix grammar|podsumuj|przet[lł]umacz)/i.test(text)) return 0.38;
  if (analysis.intent === 'tool') return 0.2;
  return 0.62;
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
      : profile === 'vision'
        ? assignment.visionModelId
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

function buildRouteMetrics({ requestStartedAt, firstTokenAt, request }) {
  const timings = request?.timings && typeof request.timings === 'object' ? request.timings : {};
  return {
    totalLatencyMs: Math.max(0, Date.now() - Number(requestStartedAt || Date.now())),
    ttftMs: Number.isFinite(firstTokenAt) ? Math.max(0, firstTokenAt - requestStartedAt) : null,
    promptAssemblyMs: coerceMetric(timings.promptAssemblyMs),
    retrievalMs: coerceMetric(timings.retrievalMs),
    historyCompactionMs: coerceMetric(timings.historyCompactionMs),
  };
}

function coerceMetric(value) {
  return Number.isFinite(value) ? Number(value) : null;
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
