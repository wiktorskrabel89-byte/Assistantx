'use strict';

const DEFAULT_MODELS = [
  {
    provider: 'groq',
    model: 'qwen-32b',
    supportsTools: true,
    supportsVision: false,
    supportsStreaming: true,
    contextWindow: 32768,
    reasoningTier: 'fast',
    pricingTier: 'low',
    latencyTier: 'fast',
  },
  {
    provider: 'openrouter',
    model: 'gpt-120b',
    supportsTools: true,
    supportsVision: true,
    supportsStreaming: true,
    contextWindow: 128000,
    reasoningTier: 'deep',
    pricingTier: 'high',
    latencyTier: 'heavy',
  },
];

function keyFor(provider, model) {
  return `${provider}:${model}`;
}

function createModelCapabilityRegistry({ models = DEFAULT_MODELS } = {}) {
  const map = new Map(models.map((entry) => [keyFor(entry.provider, entry.model), { ...entry }]));

  function register(entry) {
    if (!entry?.provider || !entry?.model) return false;
    map.set(keyFor(entry.provider, entry.model), { ...entry });
    return true;
  }

  function get(provider, model) {
    return map.get(keyFor(provider, model)) || null;
  }

  function list(filters = {}) {
    return [...map.values()].filter((entry) => {
      if (filters.supportsTools !== undefined && Boolean(entry.supportsTools) !== Boolean(filters.supportsTools)) return false;
      if (filters.supportsStreaming !== undefined && Boolean(entry.supportsStreaming) !== Boolean(filters.supportsStreaming)) return false;
      if (filters.reasoningTier && entry.reasoningTier !== filters.reasoningTier) return false;
      return true;
    });
  }

  function chooseBest({
    requiresTools = false,
    requiresVision = false,
    prefersLowCost = false,
    prefersLowLatency = false,
    minContext = 0,
  } = {}) {
    const candidates = list().filter((entry) => {
      if (requiresTools && !entry.supportsTools) return false;
      if (requiresVision && !entry.supportsVision) return false;
      if (minContext && Number(entry.contextWindow || 0) < Number(minContext)) return false;
      return true;
    });

    if (candidates.length === 0) return null;

    const ranked = [...candidates].sort((a, b) => {
      const costWeightA = prefersLowCost ? (a.pricingTier === 'low' ? 3 : a.pricingTier === 'medium' ? 2 : 1) : 0;
      const costWeightB = prefersLowCost ? (b.pricingTier === 'low' ? 3 : b.pricingTier === 'medium' ? 2 : 1) : 0;
      const latencyWeightA = prefersLowLatency ? (a.latencyTier === 'fast' ? 3 : a.latencyTier === 'medium' ? 2 : 1) : 0;
      const latencyWeightB = prefersLowLatency ? (b.latencyTier === 'fast' ? 3 : b.latencyTier === 'medium' ? 2 : 1) : 0;
      return (costWeightB + latencyWeightB + Number(b.contextWindow || 0) / 100000)
        - (costWeightA + latencyWeightA + Number(a.contextWindow || 0) / 100000);
    });

    return ranked[0] || null;
  }

  return {
    register,
    get,
    list,
    chooseBest,
  };
}

module.exports = {
  createModelCapabilityRegistry,
  DEFAULT_MODELS,
};
