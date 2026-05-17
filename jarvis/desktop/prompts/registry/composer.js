'use strict';

const { sanitizeMemoryInput } = require('./sanitizer');

function createPromptComposer({ loader }) {
  return {
    compose({
      include = ['system', 'routing', 'persona', 'coding', 'tools'],
      taskPrompt = '',
      memoryContext = '',
      temporalContext = null,
    } = {}) {
      const segments = [];
      for (const key of include) {
        const item = loader.load(key);
        if (!item?.text) continue;
        segments.push(`[${key.toUpperCase()} v${item.version}]\n${item.text}`);
      }

      if (memoryContext) {
        segments.push(`[MEMORY]\n${sanitizeMemoryInput(memoryContext)}`);
      }
      if (temporalContext && typeof temporalContext === 'object') {
        const ctx = temporalContext;
        const lines = [
          `Current datetime: ${ctx.iso || 'unknown'}`,
          `Timezone: ${ctx.timezone || 'unknown'}`,
          `Day of week: ${ctx.weekday || 'unknown'}`,
          `Current hour: ${Number.isFinite(ctx.hour) ? ctx.hour : 'unknown'}`,
          `Time period: ${ctx.period || 'unknown'}`,
        ];
        segments.push(`[TEMPORAL_CONTEXT]\n${lines.join('\n')}`);
      }
      if (taskPrompt) {
        segments.push(`[TASK]\n${String(taskPrompt || '').trim()}`);
      }
      return segments.join('\n\n---\n\n');
    },
  };
}

module.exports = { createPromptComposer };
