const { createRuntimeV2 } = require('../../../jarvis/desktop/electron/runtime');
const { runOrchestration } = require('../../../jarvis/desktop/electron/ai/orchestrator/orchestrator');

describe('runtime v2 orchestration integration', () => {
  test('runs DAG workflow and completes tasks', async () => {
    const runtime = createRuntimeV2();
    const calls = [];

    const result = await runOrchestration({
      runtime,
      input: {
        owner: 'test',
        steps: [
          {
            id: 'step-1',
            name: 'first',
            type: 'custom',
            dependsOn: [],
            params: { value: 1 },
          },
          {
            id: 'step-2',
            name: 'second',
            type: 'custom',
            dependsOn: ['step-1'],
            params: { value: 2 },
          },
        ],
      },
      handlers: {
        custom: async (params) => {
          calls.push(params.value);
          return { ok: true, value: params.value };
        },
      },
    });

    expect(result.ok).toBe(true);
    expect(result.state).toBe('completed');
    expect(calls).toEqual([1, 2]);
    expect(Array.isArray(result.graph)).toBe(true);
  });
});
