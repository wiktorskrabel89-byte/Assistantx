'use strict';

const { estimateTokens, estimateChunkTokens } = require('./budgeting/token-estimator');
const { rankChunks } = require('./ranking/chunk-ranker');
const { summarizeHistory } = require('./summarization/history-summarizer');
const { compressChunks } = require('./compression/context-compressor');
const { applySlidingWindow } = require('./policies/sliding-window-policy');

function resolveBudget({ providerCaps, maxTokens, reserveOutput = 1200 } = {}) {
  const providerMax = Number(providerCaps?.contextWindow || providerCaps?.maxContext || 0);
  const rawMax = Number(maxTokens || providerMax || 8000);
  return Math.max(1200, rawMax - Math.max(200, Number(reserveOutput || 0)));
}

function createContextBudgetManager({ maxTokens = 8000, providerCapabilities = null } = {}) {
  return {
    buildContext(chunks = [], options = {}) {
      const budget = resolveBudget({
        providerCaps: options.providerCapabilities || providerCapabilities,
        maxTokens: options.maxTokens || maxTokens,
        reserveOutput: options.reserveOutput,
      });

      const compressed = compressChunks(chunks, { maxChars: options.maxChars || 1200 });
      const ranked = rankChunks(estimateChunkTokens(compressed), { query: options.query || '' });
      const windowed = applySlidingWindow(ranked, { maxChunks: options.maxChunks || 20 });

      let used = 0;
      const selected = [];
      for (const chunk of windowed) {
        const tokenEstimate = Number(chunk.estimatedTokens || estimateTokens(chunk.text || ''));
        if (tokenEstimate > budget) continue;
        if (used + tokenEstimate > budget) continue;
        if (chunk.scope === 'full-repo') continue;
        selected.push(chunk);
        used += tokenEstimate;
      }

      const summary = summarizeHistory(options.history || [], options.maxHistoryEntries || 10);
      const summaryTokens = estimateTokens(summary);
      if (summary && used + summaryTokens <= budget) {
        selected.push({ kind: 'history-summary', text: summary, estimatedTokens: summaryTokens });
        used += summaryTokens;
      }

      return {
        selected,
        usedTokens: used,
        maxTokens: budget,
        dropped: windowed.length - selected.length,
      };
    },
  };
}

module.exports = { createContextBudgetManager };
