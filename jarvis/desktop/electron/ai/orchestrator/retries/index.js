'use strict';

function createRetryPolicy({
  maxNodeRetries = 2,
  maxWorkflowRetries = 1,
} = {}) {
  return {
    shouldRetryNode(node) {
      return Number(node?.attempts || 0) <= maxNodeRetries;
    },
    shouldRetryWorkflow(workflowState = {}) {
      return Number(workflowState.retryCount || 0) < maxWorkflowRetries;
    },
    nextWorkflowRetry(workflowState = {}) {
      return {
        ...workflowState,
        retryCount: Number(workflowState.retryCount || 0) + 1,
      };
    },
  };
}

module.exports = { createRetryPolicy };
