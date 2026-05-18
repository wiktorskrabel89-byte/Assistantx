'use strict';

const { AiProvider } = require('../provider-interface');

const DEFAULT_BASE_URL = process.env.JARVIS_CLOUD_AI_BASE_URL || 'https://openrouter.ai/api/v1';
const DEFAULT_ENDPOINT = '/chat/completions';
const KEYTAR_SERVICE = 'AssistantX';
const KEYTAR_ACCOUNTS = [
  'openrouter-api-key',
  'groq-api-key',
  'alibaba-api-key',
];

class CloudApiProvider extends AiProvider {
  constructor({ baseUrl = DEFAULT_BASE_URL, endpoint = DEFAULT_ENDPOINT } = {}) {
    super();
    this.provider = 'cloud-api';
    this.baseUrl = String(baseUrl || DEFAULT_BASE_URL).replace(/\/$/, '');
    this.endpoint = String(endpoint || DEFAULT_ENDPOINT);
  }

  async stream(request = {}, onEvent = () => {}) {
    const model = String(request.model || 'google/gemma-2-9b-it');
    const apiKey = await resolveApiKey();
    if (!apiKey) throw new Error('Cloud API key is not configured.');
    const response = await fetch(`${this.baseUrl}${this.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: normalizeMessages(request),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Cloud AI streaming request failed (${response.status})`);
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
            onEvent({ type: 'token', token, provider: this.provider, model });
          }
        } catch {
          // ignore malformed frames
        }
      }
    }
    onEvent({ type: 'done', provider: this.provider, model });
    return { text, provider: this.provider, model };
  }

  async generate(request = {}) {
    const model = String(request.model || 'google/gemma-2-9b-it');
    const apiKey = await resolveApiKey();
    if (!apiKey) throw new Error('Cloud API key is not configured.');
    const response = await fetch(`${this.baseUrl}${this.endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: normalizeMessages(request),
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      throw new Error(`Cloud AI request failed (${response.status})`);
    }
    const payload = await response.json();
    return {
      text: String(payload?.choices?.[0]?.message?.content || payload?.choices?.[0]?.text || ''),
      toolCalls: [],
      confidence: 0.7,
      usage: {
        inputTokens: Number(payload?.usage?.prompt_tokens || 0),
        outputTokens: Number(payload?.usage?.completion_tokens || 0),
        totalTokens: Number(payload?.usage?.total_tokens || 0),
      },
      latency: 0,
      provider: this.provider,
      model,
    };
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

async function resolveApiKey() {
  const envKey = process.env.OPENROUTER_API_KEY
    || process.env.GROQ_API_KEY
    || process.env.ALIBABA_API_KEY
    || process.env.JARVIS_CLOUD_API_KEY
    || '';
  if (envKey) return envKey;

  let keytar = null;
  try {
    keytar = require('keytar');
  } catch {
    keytar = null;
  }
  if (!keytar) return '';
  for (const account of KEYTAR_ACCOUNTS) {
    try {
      const token = await keytar.getPassword(KEYTAR_SERVICE, account);
      if (token) return token;
    } catch {
      // continue with next account
    }
  }
  return '';
}

module.exports = {
  CloudApiProvider,
};

