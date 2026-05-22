'use strict';

const { AiProvider } = require('../provider-interface');

const DEFAULT_BASE_URL = process.env.JARVIS_CLOUD_AI_BASE_URL || 'https://openrouter.ai/api/v1';
const DEFAULT_ENDPOINT = '/chat/completions';
const KEYTAR_SERVICE = 'AssistantX';
const PROVIDER_CONFIG = {
  openrouter: {
    baseUrl: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',
    endpoint: '/chat/completions',
    keyEnvs: ['OPENROUTER_API_KEY', 'JARVIS_CLOUD_API_KEY'],
    keytarAccounts: ['openrouter-api-key'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
  groq: {
    baseUrl: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    endpoint: '/chat/completions',
    keyEnvs: ['GROQ_API_KEY'],
    keytarAccounts: ['groq-api-key'],
    authHeader: 'Authorization',
    authPrefix: 'Bearer ',
  },
  anthropic: {
    baseUrl: process.env.ANTHROPIC_BASE_URL || 'https://api.anthropic.com',
    endpoint: '/v1/messages',
    keyEnvs: ['ANTHROPIC_API_KEY'],
    keytarAccounts: ['anthropic-api-key'],
    authHeader: 'x-api-key',
    authPrefix: '',
  },
};

class CloudApiProvider extends AiProvider {
  constructor({ baseUrl = DEFAULT_BASE_URL, endpoint = DEFAULT_ENDPOINT } = {}) {
    super();
    this.provider = 'cloud-api';
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.endpoint = String(endpoint || DEFAULT_ENDPOINT);
  }

  async stream(request = {}, onEvent = () => {}) {
    const provider = normalizeProvider(request.provider);
    const model = String(request.model || 'qwen/qwen-2.5-32b-instruct');
    const apiKey = await resolveApiKey(provider);
    if (!apiKey) throw new Error(`Cloud API key is not configured for provider '${provider}'.`);
    if (provider === 'anthropic') {
      return this.streamAnthropic({ provider, model, apiKey, request }, onEvent);
    }
    return this.streamOpenAiCompatible({ provider, model, apiKey, request }, onEvent);
  }

  async generate(request = {}) {
    const provider = normalizeProvider(request.provider);
    const model = String(request.model || 'qwen/qwen-2.5-32b-instruct');
    const apiKey = await resolveApiKey(provider);
    if (!apiKey) throw new Error(`Cloud API key is not configured for provider '${provider}'.`);
    const config = getProviderConfig(provider);
    const headers = {
      'Content-Type': 'application/json',
      [config.authHeader]: `${config.authPrefix}${apiKey}`,
    };
    if (provider === 'anthropic') headers['anthropic-version'] = '2023-06-01';
    const body = provider === 'anthropic'
      ? {
        model,
        max_tokens: 2048,
        stream: false,
        messages: toAnthropicMessages(request),
      }
      : {
        model,
        stream: false,
        messages: normalizeMessages(request),
      };
    const response = await fetch(`${config.baseUrl}${config.endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      throw new Error(`Cloud AI request failed for '${provider}' (${response.status})`);
    }
    const payload = await response.json();
    const anthropicText = Array.isArray(payload?.content)
      ? payload.content
        .map((entry) => (entry?.type === 'text' ? String(entry?.text || '') : ''))
        .join('')
      : '';
    return {
      text: String(
        payload?.choices?.[0]?.message?.content
        || payload?.choices?.[0]?.text
        || anthropicText
        || '',
      ),
      toolCalls: [],
      confidence: 0.7,
      usage: {
        inputTokens: Number(payload?.usage?.prompt_tokens || 0),
        outputTokens: Number(payload?.usage?.completion_tokens || 0),
        totalTokens: Number(payload?.usage?.total_tokens || 0),
      },
      latency: 0,
      provider,
      model,
    };
  }

  async getReadiness() {
    const readiness = {};
    const providers = Object.keys(PROVIDER_CONFIG);
    for (const provider of providers) {
      const apiKey = await resolveApiKey(provider);
      readiness[provider] = { ready: Boolean(apiKey) };
    }
    return {
      providers: readiness,
      anyReady: Object.values(readiness).some((entry) => Boolean(entry?.ready)),
    };
  }

  async streamOpenAiCompatible({ provider, model, apiKey, request }, onEvent) {
    const config = getProviderConfig(provider);
    const response = await fetch(`${config.baseUrl}${config.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [config.authHeader]: `${config.authPrefix}${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: normalizeMessages(request),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Cloud AI streaming request failed for '${provider}' (${response.status})`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const token = String(parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.text || '');
          if (token) {
            text += token;
            onEvent({ type: 'token', token, provider, model });
          }
        } catch {
          // ignore malformed frames
        }
      }
    }
    onEvent({ type: 'done', provider, model });
    return { text, provider, model };
  }

  async streamAnthropic({ provider, model, apiKey, request }, onEvent) {
    const config = getProviderConfig(provider);
    const response = await fetch(`${config.baseUrl}${config.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        [config.authHeader]: `${config.authPrefix}${apiKey}`,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: Number(request?.maxTokens || 2048),
        stream: true,
        messages: toAnthropicMessages(request),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Anthropic streaming request failed (${response.status})`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || !line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (!data || data === '[DONE]') continue;
        try {
          const parsed = JSON.parse(data);
          const token = parsed?.type === 'content_block_delta'
            ? String(parsed?.delta?.text || '')
            : '';
          if (token) {
            text += token;
            onEvent({ type: 'token', token, provider, model });
          }
        } catch {
          // ignore malformed frames
        }
      }
    }
    onEvent({ type: 'done', provider, model });
    return { text, provider, model };
  }
}

function normalizeMessages(request = {}) {
  const messages = Array.isArray(request.messages) ? request.messages : null;
  if (messages && messages.length > 0) {
    return messages.map((entry) => ({
      role: String(entry?.role || 'user'),
      content: String(entry?.content || ''),
    }));
  }
  return [{ role: 'user', content: String(request.message || '') }];
}

async function resolveApiKey(provider) {
  const config = getProviderConfig(provider);
  const envKey = config.keyEnvs
    .map((envName) => process.env[envName] || '')
    .find(Boolean) || '';
  if (envKey) return envKey;

  let keytar = null;
  try {
    keytar = require('keytar');
  } catch {
    keytar = null;
  }
  if (!keytar) return '';
  for (const account of config.keytarAccounts) {
    try {
      const token = await keytar.getPassword(KEYTAR_SERVICE, account);
      if (token) return token;
    } catch {
      // continue with next account
    }
  }
  return '';
}

function normalizeProvider(provider) {
  const normalized = String(provider || '').toLowerCase().trim();
  if (normalized && PROVIDER_CONFIG[normalized]) return normalized;
  return 'openrouter';
}

function getProviderConfig(provider) {
  const normalized = normalizeProvider(provider);
  return PROVIDER_CONFIG[normalized];
}

function toAnthropicMessages(request = {}) {
  const normalized = normalizeMessages(request);
  return normalized.map((entry) => ({
    role: entry.role === 'assistant' ? 'assistant' : 'user',
    content: String(entry.content || ''),
  }));
}

module.exports = {
  CloudApiProvider,
};
