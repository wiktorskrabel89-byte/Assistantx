'use strict';

function createContextBudgetManager({ maxTokens = 8000 } = {}) {
  return {
    buildContext(chunks = []) {
      let used = 0;
      const selected = [];
      for (const chunk of chunks) {
        const tokenEstimate = Math.ceil(String(chunk.text || '').length / 4);
        if (used + tokenEstimate > maxTokens) continue;
        selected.push(chunk);
        used += tokenEstimate;
      }
      return { selected, usedTokens: used, maxTokens };
    },
  };
}

module.exports = { createContextBudgetManager };
