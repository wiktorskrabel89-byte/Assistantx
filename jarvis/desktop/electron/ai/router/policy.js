'use strict';

function decideRoute(analysis) {
  const escalate = analysis.confidence < 0.55
    || analysis.retryCount > 0
    || analysis.contextSize === 'huge'
    || analysis.codingDepth === 'architecture'
    || analysis.complexity === 'hard';

  const target = escalate ? { provider: 'openrouter', model: 'gpt-120b' } : { provider: 'groq', model: 'qwen-32b' };

  return {
    ...target,
    reason: escalate ? 'escalation' : 'fast-lane',
  };
}

module.exports = { decideRoute };
