'use strict';

const { createInternalEventBus } = require('../core/events/event-bus');
const { createRuntimeStateStore } = require('./state/store');
const { createRuntimeSessions } = require('./sessions');
const { createTaskManager } = require('./task-manager');
const { createCancellationController } = require('./cancellation');
const { createConcurrencyController } = require('./concurrency');
const { createLifecycleCoordinator } = require('./lifecycle');
const { createRuntimeStreamManager } = require('./stream-manager');
const { createStructuredLogger } = require('./observability/logger');
const { createRuntimeMetrics } = require('./observability/metrics');
const { createExecutionTimeline } = require('./observability/timeline');
const { createRuntimeCache } = require('./cache');
const { createAutomationPersistence } = require('./automation/persistence');
const { createVoiceInterruptionEngine } = require('./voice/interruption-engine');
const { isRuntimeV2Enabled } = require('./feature-flags');

function createRuntimeV2(options = {}) {
  const bus = options.bus || createInternalEventBus();
  const runtimeState = options.runtimeState || createRuntimeStateStore();
  const metrics = createRuntimeMetrics({ bus });
  const timeline = createExecutionTimeline({ bus });
  const logger = createStructuredLogger({ bus, sink: options.logSink });
  const sessions = createRuntimeSessions({ bus });
  const cancellation = createCancellationController({ bus });
  const taskManager = createTaskManager({ bus, cancellation });
  const concurrency = createConcurrencyController({ bus });
  const streamManager = createRuntimeStreamManager({ bus, cancellation, timeline });
  const lifecycle = createLifecycleCoordinator({
    bus,
    sessions,
    taskManager,
    concurrency,
    metrics,
    timeline,
  });
  const cache = createRuntimeCache();
  const automationPersistence = createAutomationPersistence();
  const voiceInterruptions = createVoiceInterruptionEngine({ bus, streamManager });

  return {
    enabled: isRuntimeV2Enabled(),
    bus,
    runtimeState,
    metrics,
    timeline,
    logger,
    sessions,
    cancellation,
    taskManager,
    concurrency,
    streamManager,
    lifecycle,
    cache,
    automationPersistence,
    voiceInterruptions,
  };
}

module.exports = {
  createRuntimeV2,
  isRuntimeV2Enabled,
};
