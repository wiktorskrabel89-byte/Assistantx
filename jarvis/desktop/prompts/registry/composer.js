'use strict';

const { sanitizeMemoryInput } = require('./sanitizer');

function createPromptComposer({ loader }) {
  return {
    compose({
      include = ['system', 'routing', 'persona', 'coding', 'tools'],
      taskPrompt = '',
      memoryContext = '',
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
      if (taskPrompt) {
        segments.push(`[TASK]\n${String(taskPrompt || '').trim()}`);
      }
      return segments.join('\n\n---\n\n');
    },
  };
}

module.exports = { createPromptComposer };
