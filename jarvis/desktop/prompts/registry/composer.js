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

      // The Constitution is always the first segment and is not gated by
      // `include` — callers cannot omit or reorder it.
      const constitution = loader.load('constitution');
      if (constitution?.text) {
        segments.push(`[CONSTITUTION v${constitution.version}]\n${constitution.text}`);
      }

      for (const key of include) {
        if (key === 'constitution') continue;
        const item = loader.load(key);
        if (!item?.text) continue;
        segments.push(`[${key.toUpperCase()} v${item.version}]\n${item.text}`);
      }

      if (memoryContext) {
        segments.push(`[MEMORY]\n${sanitizeMemoryInput(memoryContext)}`);
      }
      if (temporalContext && typeof temporalContext === 'object') {
        const ctx = temporalContext;
        const location = ctx.location && typeof ctx.location === 'object' ? ctx.location : null;
        const placeParts = [location?.city, location?.region, location?.country].filter(Boolean);
        const lines = [
          `Current datetime: ${ctx.iso || 'unknown'}`,
          `Timezone: ${ctx.timezone || 'unknown'}`,
          `Locale: ${ctx.locale || 'unknown'}`,
          `Preferred language: ${ctx.preferredLanguage || 'unknown'}`,
          `Day of week: ${ctx.weekday || 'unknown'}`,
          `Local date: ${ctx.localDate || 'unknown'}`,
          `Local time: ${ctx.localTime || 'unknown'}`,
          `Current hour: ${Number.isFinite(ctx.hour) ? ctx.hour : 'unknown'}`,
          `Time period: ${ctx.period || 'unknown'}`,
          `Approximate location: ${placeParts.length > 0 ? placeParts.join(', ') : 'unknown'}`,
          `Location source: ${location?.source || 'none'}`,
        ];
        if (Number.isFinite(location?.latitude) && Number.isFinite(location?.longitude)) {
          lines.push(`Approximate coordinates: ${location.latitude}, ${location.longitude}`);
        }
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
