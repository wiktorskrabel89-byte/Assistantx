'use strict';

function normalizeSteps(input = {}) {
  if (Array.isArray(input.steps) && input.steps.length > 0) {
    return input.steps.map((step, index) => ({
      id: step.id || `step-${index + 1}`,
      name: step.name || step.label || `Step ${index + 1}`,
      type: step.type || 'tool',
      tool: step.tool || null,
      params: { ...(step.params || {}) },
      dependsOn: Array.isArray(step.dependsOn) ? [...step.dependsOn] : [],
      verification: step.verification || null,
    }));
  }

  const message = String(input.message || input.prompt || '').trim();
  if (!message) return [];

  return [{
    id: 'step-1',
    name: 'Respond to prompt',
    type: 'respond',
    tool: null,
    params: { message },
    dependsOn: [],
    verification: 'response-non-empty',
  }];
}

function inferRequiredTools(steps = []) {
  const set = new Set();
  for (const step of steps) {
    if (step.tool) set.add(step.tool);
  }
  return [...set];
}

function buildVerificationPlan(steps = []) {
  return steps.map((step) => ({
    stepId: step.id,
    checks: step.verification ? [step.verification] : ['output-sanity'],
  }));
}

function createPlanner() {
  return {
    async createPlan(input = {}) {
      const steps = normalizeSteps(input);
      return {
        steps,
        requiredTools: inferRequiredTools(steps),
        verificationPlan: buildVerificationPlan(steps),
      };
    },
  };
}

module.exports = { createPlanner };
