'use strict';

const { analyzeRequest } = require('./analyzer');
const { decideRoute } = require('./policy');
const { OllamaProvider } = require('../providers/ollama');
const { CloudApiProvider } = require('../providers/cloud-api');

const LOCAL_MODELS = {
  fast: 'gemma4:e4b',
  coding: 'qwen2.5-coder:14b',
};

const CLOUD_MODELS = {
  fast: 'google/gemma-2-9b-it',
  coding: 'qwen/qwen-2.5-coder-14b-instruct',
};

class AIRouter {
  constructor(options = {}) {
    this.ollama = options.ollama || new OllamaProvider(options.ollamaConfig || {});
    this.cloud = options.cloud || new CloudApiProvider(options.cloudConfig || {});
  }

  async getAvailability() {
    const ollamaAvailable = await this.ollama.isHealthy();
    return {
      ollama_available: Boolean(ollamaAvailable),
      mode: ollamaAvailable ? 'local' : 'cloud-fallback',
    };
  }

  async routeRequest(request = {}, onChunk = () => {}) {
    const analysis = analyzeRequest({
      message: request?.message || extractLastMessage(request?.messages),
      contextSize: request?.contextSize,
      codingDepth: request?.contextType === 'code' ? 'architecture' : request?.codingDepth,
      retryCount: request?.retryCount || 0,
      confidence: request?.confidence,
    });
    const ollamaAvailable = await this.ollama.isHealthy();
    const route = decideRoute(analysis, { ollamaAvailable });
    const resolvedRequest = {
      ...request,
      messages: normalizeMessages(request),
      model: route.model,
      options: {
        temperature: route.reason === 'escalation' ? 0.2 : 0.7,
        ...(request.options || {}),
      },
      keepAlive: route.keepAlive,
    };

    if (route.provider === 'ollama' && ollamaAvailable) {
      return this.ollama.stream(resolvedRequest, onChunk);
    }

    return this.cloud.stream({
      ...resolvedRequest,
      model: route.reason === 'escalation' ? CLOUD_MODELS.coding : CLOUD_MODELS.fast,
    }, onChunk);
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

module.exports = {
  AIRouter,
  LOCAL_MODELS,
  CLOUD_MODELS,
};

