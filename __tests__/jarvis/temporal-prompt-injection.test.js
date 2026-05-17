const { createPromptRegistry } = require('../../jarvis/desktop/prompts/registry');

describe('temporal prompt injection', () => {
  test('includes TEMPORAL_CONTEXT segment when provided', () => {
    const registry = createPromptRegistry();
    const prompt = registry.composer.compose({
      taskPrompt: 'Say hello',
      temporalContext: {
        iso: '2026-05-17T19:00:00.000Z',
        timezone: 'Europe/Warsaw',
        weekday: 'Sunday',
        hour: 19,
        period: 'evening',
      },
    });
    expect(prompt).toContain('[TEMPORAL_CONTEXT]');
    expect(prompt).toContain('Time period: evening');
    expect(prompt).toContain('Timezone: Europe/Warsaw');
  });
});

