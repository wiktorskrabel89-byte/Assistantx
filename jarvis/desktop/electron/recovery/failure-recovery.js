'use strict';

const { RuntimeFailure } = require('./errors/runtime-errors');
const { createTimeoutManager } = require('./timeouts/timeout-manager');
const { createCleanupManager } = require('./cleanup/cleanup-manager');

function classifyError(error) {
  const message = String(error?.message || 'unknown error').toLowerCase();
  if (message.includes('timeout')) return 'timeout';
  if (message.includes('provider')) return 'provider';
  if (message.includes('tool')) return 'tool';
  if (message.includes('stuck')) return 'workflow-stuck';
  return 'unknown';
}

async function recoverFailure({ error, strategy, runtime, context = {} }) {
  const timeoutManager = createTimeoutManager();
  const cleanupManager = createCleanupManager({ runtime });

  const normalizedError = error instanceof Error
    ? error
    : new RuntimeFailure(String(error || 'Unknown runtime failure'), 'runtime-failure');

  const classification = classifyError(normalizedError);
  runtime?.bus?.publish('recovery.failure.detected', {
    classification,
    message: normalizedError.message,
    context,
  });

  timeoutManager.schedule(`recovery:${context.taskId || context.sessionId || 'global'}`, 50, () => {
    runtime?.bus?.publish('recovery.timeout.triggered', { context });
  });

  let strategyResult = null;
  if (typeof strategy === 'function') {
    strategyResult = await strategy(normalizedError, { classification, context });
  }

  const cleanupResult = await cleanupManager.cleanupExecution({
    sessionId: context.sessionId,
    taskId: context.taskId,
    reason: strategyResult?.reason || normalizedError.message,
  });

  timeoutManager.clearAll();

  return {
    recovered: Boolean(strategyResult?.recovered),
    classification,
    strategyResult,
    cleanupResult,
  };
}

module.exports = { recoverFailure };
