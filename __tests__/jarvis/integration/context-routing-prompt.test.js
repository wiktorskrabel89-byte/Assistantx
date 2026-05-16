const { createContextBudgetManager } = require('../../../jarvis/desktop/electron/memory/context/context-budget-manager');
const { createModelCapabilityRegistry } = require('../../../jarvis/desktop/electron/ai/models/registry');
const { createPromptRegistry } = require('../../../jarvis/desktop/prompts/registry');

describe('context, routing metadata, and prompt composition integration', () => {
  test('applies budgeting and metadata-driven model selection', () => {
    const context = createContextBudgetManager({ maxTokens: 100 });
    const modelRegistry = createModelCapabilityRegistry();
    const promptRegistry = createPromptRegistry();

    const route = modelRegistry.chooseBest({
      requiresTools: true,
      prefersLowLatency: true,
      prefersLowCost: true,
    });

    const built = context.buildContext([
      { kind: 'repo-local', text: 'short context block one' },
      { kind: 'repo-local', text: 'short context block two' },
      { kind: 'full-repo', text: 'this should be filtered out by policy' },
    ], {
      providerCapabilities: route,
      history: [{ role: 'user', content: 'please summarize changes' }],
      query: 'context block',
    });

    const prompt = promptRegistry.composer.compose({
      taskPrompt: 'Apply runtime policy checks.',
      memoryContext: 'Previous memory ### ```dangerous```',
    });

    expect(route).toBeTruthy();
    expect(built.usedTokens).toBeGreaterThan(0);
    expect(built.selected.some((item) => item.kind === 'full-repo')).toBe(false);
    expect(prompt).toContain('[SYSTEM');
    expect(prompt).toContain('[TASK]');
  });
});
