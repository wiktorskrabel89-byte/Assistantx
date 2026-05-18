'use strict';

const { AiProvider } = require('../provider-interface');

const DEFAULT_OLLAMA_URL = process.env.JARVIS_OLLAMA_URL || 'http://127.0.0.1:11434';

class OllamaProvider extends AiProvider {
  constructor({ baseUrl = DEFAULT_OLLAMA_URL } = {}) {
    super();
    this.provider = 'ollama';
    this.baseUrl = String(baseUrl || DEFAULT_OLLAMA_URL).replace(/\/$/, '');
  }

  async isHealthy() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async generate(request = {}) {
    const model = String(request.model || 'gemma4:e4b');
    const body = {
      model,
      messages: normalizeMessages(request),
      options: sanitizeOptions(request.options),
      keep_alive: request.keepAlive ?? null,
      stream: false,
    };
    const startedAt = Date.now();
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90_000),
    });
    if (!response.ok) {
      throw new Error(`Ollama request failed (${response.status})`);
    }
    const payload = await response.json();
    return {
      text: String(payload?.message?.content || ''),
      toolCalls: [],
      confidence: 0.75,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latency: Date.now() - startedAt,
      provider: this.provider,
      model,
    };
  }

  async stream(request = {}, onEvent = () => {}) {
    const model = String(request.model || 'gemma4:e4b');
    const body = {
      model,
      messages: normalizeMessages(request),
      options: sanitizeOptions(request.options),
      keep_alive: request.keepAlive ?? null,
      stream: true,
    };
    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`Ollama streaming request failed (${response.status})`);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        if (line) {
          try {
            const parsed = JSON.parse(line);
            const token = String(parsed?.message?.content || '');
            if (token) {
              fullText += token;
              onEvent({ type: 'token', token, provider: this.provider, model });
            }
            if (parsed?.done) {
              onEvent({ type: 'done', provider: this.provider, model });
            }
          } catch {
            // ignore malformed stream lines
          }
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }
    return {
      text: fullText,
      provider: this.provider,
      model,
    };
  }
}

function sanitizeOptions(options = {}) {
  const source = options && typeof options === 'object' ? options : {};
  const allowed = {};
  if (Number.isFinite(source.temperature)) allowed.temperature = Number(source.temperature);
  if (Number.isFinite(source.top_p)) allowed.top_p = Number(source.top_p);
  if (Number.isFinite(source.num_ctx)) allowed.num_ctx = Number(source.num_ctx);
  return allowed;
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

module.exports = {
  OllamaProvider,
  DEFAULT_OLLAMA_URL,
};

