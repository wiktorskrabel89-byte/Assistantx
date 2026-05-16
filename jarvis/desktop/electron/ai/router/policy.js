'use strict';

const { createModelCapabilityRegistry } = require('../models/capability-registry');

const registry = createModelCapabilityRegistry();

function decideRoute(analysis) {
  const escalate = analysis.confidence < 0.55
    || analysis.retryCount > 0
    || analysis.contextSize === 'huge'
    || analysis.codingDepth === 'architecture'
    || analysis.complexity === 'hard';

  const target = registry.chooseBest({
    requiresTools: true,
    minContext: analysis.contextSize === 'huge' ? 64000 : 0,
    prefersLowCost: !escalate,
    prefersLowLatency: !escalate,
  }) || (escalate
    ? { provider: 'openrouter', model: 'gpt-120b' }
    : { provider: 'groq', model: 'qwen-32b' });

  return {
    provider: target.provider,
    model: target.model,
    reason: escalate ? 'escalation' : 'fast-lane',
  };
}

module.exports = { decideRoute };
