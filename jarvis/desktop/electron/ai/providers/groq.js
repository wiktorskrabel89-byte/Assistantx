'use strict';

const { AiProvider } = require('../provider-interface');

class GroqProvider extends AiProvider {
  constructor({ model = 'qwen-2.5-32b-instruct', client = null } = {}) {
    super();
    this.provider = 'groq';
    this.model = model;
    this.client = client;
  }

  async generate(request) {
    const startedAt = Date.now();
    const text = String(request?.message || '').trim();
    return {
      text,
      toolCalls: [],
      confidence: 0.5,
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latency: Date.now() - startedAt,
      provider: this.provider,
      model: this.model,
    };
  }
}

module.exports = { GroqProvider };
