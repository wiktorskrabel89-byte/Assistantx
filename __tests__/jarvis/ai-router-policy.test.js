'use strict';

const { decideRoute } = require('../../jarvis/desktop/electron/ai/router/policy');

describe('ai router policy', () => {
  it('uses local fast lane on gpu0 for chat when local runtime is healthy', () => {
    const route = decideRoute({ confidence: 0.8, retryCount: 0, contextSize: 'small', codingDepth: 'basic', complexity: 'simple' }, {
      profile: 'chat',
      availability: { ollama_available: true, required_models_present: true },
    });
    expect(route.provider).toBe('ollama');
    expect(route.model).toBe('qwen2.5-coder:14b');
    expect(route.lane).toBe('fast');
    expect(route.gpuAffinity).toBe('gpu0');
  });

  it('uses utility lane on gpu1 for non-escalated tool requests', () => {
    const route = decideRoute({ confidence: 0.9, retryCount: 0, contextSize: 'small', codingDepth: 'basic', complexity: 'simple' }, {
      profile: 'tool',
      availability: { ollama_available: true, required_models_present: true },
    });
    expect(route.provider).toBe('ollama');
    expect(route.model).toBe('gemma3:4b');
    expect(route.lane).toBe('utility');
    expect(route.gpuAffinity).toBe('gpu1');
  });

  it('falls back to cloud route when local runtime is unavailable', () => {
    const route = decideRoute({ confidence: 0.9, retryCount: 0, contextSize: 'small', codingDepth: 'basic', complexity: 'simple' }, {
      profile: 'chat',
      cloudProviderOrder: ['groq', 'openrouter'],
      availability: {
        ollama_available: false,
        cloud: { providers: { groq: { ready: true } } },
      },
    });
    expect(route.provider).toBe('groq');
    expect(route.reason).toBe('local-unavailable-fallback');
  });
});
