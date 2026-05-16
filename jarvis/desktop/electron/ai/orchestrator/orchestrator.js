'use strict';

const { createPlanner } = require('./planner');
const { createExecutor } = require('./executor');
const { createVerificationEngine } = require('../verification/engine');
const { createOrchestrationVerifier } = require('./verifier');
const { createRetryPolicy } = require('./retries');
const { createOrchestrationCoordinator } = require('./coordinator');

async function runOrchestration({
  planner,
  executor,
  verifier,
  retryPolicy,
  input,
  runtime,
  toolEngine,
  handlers,
} = {}) {
  const resolvedPlanner = planner || createPlanner();
  const resolvedExecutor = executor || createExecutor({ runtime, toolEngine, directHandlers: handlers });
  const resolvedVerifier = verifier || createOrchestrationVerifier({
    verificationEngine: createVerificationEngine(),
  });
  const resolvedRetryPolicy = retryPolicy || createRetryPolicy();

  const coordinator = createOrchestrationCoordinator({
    planner: resolvedPlanner,
    executor: resolvedExecutor,
    verifier: resolvedVerifier,
    retryPolicy: resolvedRetryPolicy,
    runtime,
  });

  return coordinator.run(input || {});
}

module.exports = { runOrchestration };
