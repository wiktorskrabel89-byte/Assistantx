'use strict';

const MODEL_CAPABILITIES = {
  'groq:qwen-32b': { coding: true, vision: false, maxContext: 32768, supportsTools: true, latencyTier: 'fast' },
  'openrouter:gpt-120b': { coding: true, vision: true, maxContext: 128000, supportsTools: true, latencyTier: 'heavy' },
};

function getModelCapabilities(provider, model) {
  return MODEL_CAPABILITIES[`${provider}:${model}`] || null;
}

module.exports = {
  MODEL_CAPABILITIES,
  getModelCapabilities,
};
