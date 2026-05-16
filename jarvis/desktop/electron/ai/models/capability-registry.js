'use strict';

const { createModelCapabilityRegistry, DEFAULT_MODELS } = require('./registry');

const registry = createModelCapabilityRegistry({ models: DEFAULT_MODELS });

const MODEL_CAPABILITIES = Object.fromEntries(
  DEFAULT_MODELS.map((entry) => [`${entry.provider}:${entry.model}`, entry]),
);

function getModelCapabilities(provider, model) {
  return registry.get(provider, model);
}

module.exports = {
  MODEL_CAPABILITIES,
  getModelCapabilities,
  createModelCapabilityRegistry,
};
