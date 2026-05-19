'use strict';

const { analyzeRequest } = require('./analyzer');
const { decideRoute } = require('./policy');
const { OllamaProvider } = require('../providers/ollama');
const { CloudApiProvider } = require('../providers/cloud-api');

const ROUTING_PROFILES = {
  chat: {
    local: 'gemma4:e4b',
  },
  coding: {
    local: 'qwen2.5-coder:14b',
  },
  tool: {
    local: 'qwen2.5-coder:14b',
  },
};

const REQUIRED_LOCAL_MODELS = ['gemma4:e4b', 'qwen2.5-coder:14b'];
const DEFAULT_CLOUD_PROVIDER_ORDER = ['groq', 'openrouter'];

class AIRouter {
  constructor(options = {}) {
    this.ollama = options.ollama || new OllamaProvider(options.ollamaConfig || {});
    this.cloud = options.cloud || new CloudApiProvider(options.cloudConfig || {});
    this.requiredModels = Array.isArray(options.requiredModels) && options.requiredModels.length > 0
      ? options.requiredModels
      : REQUIRED_LOCAL_MODELS;
    this.cloudProviderOrder = normalizeProviderOrder(
      options.cloudProviderOrder || process.env.JARVIS_CLOUD_PROVIDER_ORDER || DEFAULT_CLOUD_PROVIDER_ORDER,
    );
  }

  async getAvailability() {
    const ollamaHealth = await this.ollama.getHealth(this.requiredModels);
    const cloudReadiness = await this.cloud.getReadiness();
    const ollamaAvailable = Boolean(ollamaHealth.healthy && ollamaHealth.requiredModelsPresent);
    return {
      ollama_available: Boolean(ollamaAvailable),
      ollama_healthy: Boolean(ollamaHealth.healthy),
      required_models: ollamaHealth.requiredModels,
      installed_models: ollamaHealth.installedModels,
      missing_models: ollamaHealth.missingModels,
      required_models_present: ollamaHealth.requiredModelsPresent,
      cloud: cloudReadiness,
      cloud_provider_order: this.cloudProviderOrder,
      mode: ollamaAvailable ? 'local' : 'cloud-fallback',
    };
  }

  async routeRequest(request = {}, onChunk = () => {}) {
    const profile = normalizeProfile(request?.profile || inferProfile(request));
    const analysis = analyzeRequest({
      message: request?.message || extractLastMessage(request?.messages),
      contextSize: request?.contextSize,
      codingDepth: request?.contextType === 'code' ? 'architecture' : request?.codingDepth,
      retryCount: request?.retryCount || 0,
      confidence: request?.confidence,
    });
    const availability = await this.getAvailability();
    const route = decideRoute(analysis, {
      availability,
      profile,
      cloudProviderOrder: this.cloudProviderOrder,
    });
    const resolvedRequest = {
      ...request,
      messages: normalizeMessages(request),
      model: route.model,
      provider: route.provider,
      options: {
        temperature: route.reason === 'escalation' ? 0.2 : 0.7,
        ...(request.options || {}),
      },
      keepAlive: route.keepAlive,
    };

    if (route.provider === 'ollama' && availability.ollama_available) {
      const response = await this.ollama.stream(resolvedRequest, onChunk);
      return {
        ...response,
        route,
        profile,
        availability,
      };
    }

    const response = await this.cloud.stream({
      ...resolvedRequest,
      provider: route.provider,
      model: route.model,
    }, onChunk);
    return {
      ...response,
      route,
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

module.exports = {
  AIRouter,
  ROUTING_PROFILES,
  REQUIRED_LOCAL_MODELS,
  DEFAULT_CLOUD_PROVIDER_ORDER,
};
