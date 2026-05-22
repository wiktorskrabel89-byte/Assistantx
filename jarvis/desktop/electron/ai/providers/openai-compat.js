'use strict';

const { AiProvider } = require('../provider-interface');

class OpenAICompatProvider extends AiProvider {
  constructor({ baseUrl }) {
    super();
    this.provider = 'openai-compat';
    this.baseUrl = String(baseUrl || '').replace(/\/$/, '');
  }

  async isHealthy() {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(3_000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async listModels() {
    try {
      const response = await fetch(`${this.baseUrl}/v1/models`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) return [];
      const payload = await response.json();
      const models = Array.isArray(payload?.data) ? payload.data : [];
      return models
        .map((item) => String(item?.id || '').trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  async stream(request = {}, onEvent = () => {}) {
    const model = String(request.model || '');
    const response = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: true,
        messages: normalizeMessages(request),
        temperature: Number(request?.options?.temperature ?? 0.7),
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body) {
      throw new Error(`OpenAI-compatible streaming request failed (${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let fullText = '';
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
            fullText += token;
            onEvent({ type: 'token', token, provider: this.provider, model });
          }
        } catch {
          // ignore malformed chunks
        }
      }
    }
    onEvent({ type: 'done', provider: this.provider, model });
    return { text: fullText, provider: this.provider, model };
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

module.exports = {
  OpenAICompatProvider,
};
