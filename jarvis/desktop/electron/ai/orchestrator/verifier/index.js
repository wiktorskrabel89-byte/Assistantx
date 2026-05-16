'use strict';

function createOrchestrationVerifier({ verificationEngine } = {}) {
  return {
    async verifyNodeExecution(node, execution, context = {}) {
      if (!verificationEngine || typeof verificationEngine.verify !== 'function') {
        return { ok: Boolean(execution?.ok !== false), reason: execution?.error || null };
      }
      return verificationEngine.verify(execution, {
        taskType: context.taskType || 'general',
        checks: Array.isArray(node?.verificationChecks) ? node.verificationChecks : [],
      });
    },
  };
}

module.exports = { createOrchestrationVerifier };
