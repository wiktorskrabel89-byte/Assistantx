'use strict';

const { RuntimeFailure } = require('./errors/runtime-errors');
const { createTimeoutManager } = require('./timeouts/timeout-manager');
const { createCleanupManager } = require('./cleanup/cleanup-manager');

function classifyError(error) {
  const message = String(error?.message || 'unknown error').toLowerCase();
  if (/(timeout|timed out|deadline exceeded)/.test(message)) return 'timeout';
  if (/(websocket|ws|http|network|transport|socket|connection reset)/.test(message)) return 'transport';
  if (/(provider|openai|groq|openrouter|anthropic|google api)/.test(message)) return 'provider';
  if (/(model load|gpu|vram|out of memory|cuda|insufficient memory)/.test(message)) return 'model-load';
  if (/(tool|mcp|action execution|executor)/.test(message)) return 'tool-execution';
  if (/(memory corruption|index corrupted|vector index|memory backend)/.test(message)) return 'memory-corruption';
  if (/(permission|forbidden|unauthorized|approval)/.test(message)) return 'permission';
  if (/(resource exhaustion|queue full|overloaded|rate limit)/.test(message)) return 'resource-exhaustion';
  return 'unknown';
}

function getRemediationPlan(classification) {
  const plans = {
    timeout: { actions: ['retry', 'degrade-route'], tier: 'silent' },
    transport: { actions: ['reconnect', 'restart-sidecar'], tier: 'silent' },
    provider: { actions: ['demote-provider', 'fallback-provider'], tier: 'silent' },
    'model-load': { actions: ['demote-model', 'restart-runtime'], tier: 'silent' },
    'tool-execution': { actions: ['retry-tool', 'disable-tool-subsystem'], tier: 'notify' },
    'memory-corruption': { actions: ['clear-session-state', 'rebuild-memory-index'], tier: 'notify' },
    permission: { actions: ['request-approval'], tier: 'strict' },
    'resource-exhaustion': { actions: ['apply-backpressure', 'queue-background-jobs'], tier: 'silent' },
    unknown: { actions: ['degrade-gracefully'], tier: 'notify' },
  };
  return plans[classification] || plans.unknown;
}

async function recoverFailure({ error, strategy, runtime, context = {} }) {
  const timeoutManager = createTimeoutManager();
  const cleanupManager = createCleanupManager({ runtime });

  const normalizedError = error instanceof Error
    ? error
    : new RuntimeFailure(String(error || 'Unknown runtime failure'), 'runtime-failure');

  const classification = classifyError(normalizedError);
  const remediation = getRemediationPlan(classification);
  runtime?.bus?.publish('recovery.failure.detected', {
    classification,
    message: normalizedError.message,
    remediation,
    context,
  });

  timeoutManager.schedule(`recovery:${context.taskId || context.sessionId || 'global'}`, 50, () => {
    runtime?.bus?.publish('recovery.timeout.triggered', { context });
  });

  let strategyResult = null;
  if (typeof strategy === 'function') {
    strategyResult = await strategy(normalizedError, { classification, remediation, context });
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
    remediation,
    strategyResult,
    cleanupResult,
  };
}

module.exports = { recoverFailure, classifyError, getRemediationPlan };
