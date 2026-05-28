'use strict';

const { AIRouter } = require('../../jarvis/desktop/electron/ai/router');

describe('ai router metrics', () => {
  it('emits route latency metrics including ttft and prompt/retrieval timings', async () => {
    const ollama = {
      getHealth: async () => ({
        healthy: true,
        requiredModelsPresent: true,
        requiredModels: [],
        installedModels: ['qwen2.5-coder:14b', 'gemma3:4b'],
        missingModels: [],
      }),
      stream: async (_request, onEvent) => {
        onEvent({ type: 'token', token: 'ok' });
        onEvent({ type: 'done' });
        return { text: 'ok', provider: 'ollama', model: 'qwen2.5-coder:14b' };
      },
    };
    const cloud = {
      getReadiness: async () => ({ providers: {}, anyReady: false }),
      stream: async () => ({ text: 'fallback', provider: 'groq', model: 'x' }),
    };
    const router = new AIRouter({ ollama, cloud });

    const response = await router.routeRequest({
      message: 'hello',
      timings: {
        promptAssemblyMs: 11,
        retrievalMs: 7,
      },
    });

    expect(response.metrics).toEqual(expect.objectContaining({
      promptAssemblyMs: 11,
      retrievalMs: 7,
    }));
    expect(response.metrics.totalLatencyMs).toBeGreaterThanOrEqual(0);
    expect(response.metrics.ttftMs).toBeGreaterThanOrEqual(0);
  });
});
