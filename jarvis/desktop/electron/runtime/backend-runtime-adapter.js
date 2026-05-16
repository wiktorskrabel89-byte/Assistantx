'use strict';

const crypto = require('crypto');

const { runOrchestration } = require('../ai/orchestrator/orchestrator');
const { recoverFailure } = require('../recovery/failure-recovery');
const { createToolRegistry } = require('../tools/registry');
const { executeStructuredAction } = require('../tools/execution-engine');
const { createPermissionPolicy } = require('../permissions/policy');

function toGraphSteps(legacySteps = [], context = {}) {
  return legacySteps.map((step, index) => ({
    id: step.id || `legacy-step-${index + 1}`,
    name: step.label || step.command || `Legacy step ${index + 1}`,
    type: 'tool',
    tool: 'legacy-command',
    params: {
      ...step,
      source: context.source || 'local',
      origin: context.origin || 'desktop',
      taskId: context.taskId || null,
    },
    dependsOn: index === 0 ? [] : [legacySteps[index - 1]?.id || `legacy-step-${index}`],
    verificationChecks: ['output-sanity'],
  }));
}

function createBackendRuntimeAdapter({
  runtime,
  planPrompt,
  runAiPrompt,
  executeStructuredCommand,
  publishTaskUpdate,
  saveTask,
  rememberPrompt,
  getFavoriteApp,
}) {
  if (!runtime) throw new Error('runtime is required');
  const registry = createToolRegistry();
  const permissions = createPermissionPolicy();

  registry.register({
    name: 'legacy-command',
    permission: 'legacy-command',
    async run(params) {
      return executeStructuredCommand(params, {
        source: params?.source || 'local',
        origin: params?.origin || 'desktop',
        taskId: params?.taskId || null,
      });
    },
  });

  const toolEngine = {
    async execute({ action, sessionId, taskId, correlationId }) {
      return executeStructuredAction({
        action,
        registry,
        permissions,
        sandbox: runtime.sandbox,
        bus: runtime.bus,
        requester: 'runtime-v2-orchestrator',
        sessionId,
        taskId,
        correlationId,
      });
    },
  };

  async function executePrompt(prompt, meta = {}) {
    const normalizedPrompt = String(prompt || '').trim();
    if (!normalizedPrompt) return null;

    rememberPrompt(normalizedPrompt);
    const plan = planPrompt(normalizedPrompt, { favoriteApp: getFavoriteApp() });

    const workflowId = `rtwf-${crypto.randomUUID().slice(0, 12)}`;
    runtime.automationPersistence.update((current) => ({
      ...current,
      workflows: [
        {
          id: workflowId,
          prompt: normalizedPrompt,
          source: meta.source || 'local',
          origin: meta.origin || 'desktop',
          status: 'queued',
          createdAt: new Date().toISOString(),
          retries: 0,
        },
        ...(current.workflows || []).slice(0, 99),
      ],
    }));

    if (plan.steps.length === 0) {
      const cached = runtime.cache.get(`ai:${normalizedPrompt}`);
      if (cached) return cached;
      const aiResult = await runAiPrompt(normalizedPrompt, {
        ...meta,
        runtimeV2: true,
        workflowId,
      });
      runtime.cache.set(`ai:${normalizedPrompt}`, aiResult, 45_000);
      runtime.automationPersistence.update((current) => ({
        ...current,
        workflows: (current.workflows || []).map((workflow) => workflow.id === workflowId
          ? { ...workflow, status: 'completed', completedAt: new Date().toISOString() }
          : workflow),
      }));
      return aiResult;
    }

    const task = {
      id: `rt-task-${crypto.randomUUID().slice(0, 12)}`,
      prompt: normalizedPrompt,
      source: meta.source || 'local',
      origin: meta.origin || 'desktop',
      status: 'queued',
      summary: plan.summary,
      createdAt: new Date().toISOString(),
      steps: plan.steps,
    };

    saveTask(task);
    publishTaskUpdate({
      taskId: task.id,
      status: 'queued',
      progress: 0,
      prompt: task.prompt,
      summary: task.summary,
      source: task.source,
      task,
    });

    const orchestration = await runOrchestration({
      runtime,
      input: {
        owner: task.source,
        taskType: 'automation',
        prompt: normalizedPrompt,
        metadata: {
          workflowId,
          origin: task.origin,
        },
        steps: toGraphSteps(plan.steps, {
          source: task.source,
          origin: task.origin,
          taskId: task.id,
        }),
      },
      toolEngine,
      handlers: {
        respond: async (params) => runAiPrompt(params?.message || normalizedPrompt, {
          source: task.source,
          origin: task.origin,
          taskId: task.id,
        }),
      },
    });

    if (!orchestration.ok) {
      await recoverFailure({
        error: new Error(orchestration.reason || orchestration.error || 'runtime-v2-orchestration-failed'),
        runtime,
        context: {
          sessionId: orchestration?.task?.sessionId || null,
          taskId: task.id,
        },
      });

      publishTaskUpdate({
        taskId: task.id,
        status: orchestration.state || 'failed',
        progress: 100,
        prompt: task.prompt,
        summary: orchestration.reason || orchestration.error || 'Failed',
        source: task.source,
        task: {
          ...task,
          status: orchestration.state || 'failed',
        },
      });

      runtime.automationPersistence.update((current) => ({
        ...current,
        workflows: (current.workflows || []).map((workflow) => workflow.id === workflowId
          ? {
            ...workflow,
            status: orchestration.state || 'failed',
            error: orchestration.reason || orchestration.error || 'failed',
            completedAt: new Date().toISOString(),
          }
          : workflow),
      }));

      return orchestration;
    }

    publishTaskUpdate({
      taskId: task.id,
      status: 'completed',
      progress: 100,
      prompt: task.prompt,
      summary: task.summary,
      source: task.source,
      task: {
        ...task,
        status: 'completed',
        completedAt: new Date().toISOString(),
      },
    });

    runtime.automationPersistence.update((current) => ({
      ...current,
      workflows: (current.workflows || []).map((workflow) => workflow.id === workflowId
        ? { ...workflow, status: 'completed', completedAt: new Date().toISOString() }
        : workflow),
    }));

    return orchestration;
  }

  function interruptTask(taskId, reason = 'user-interrupt') {
    runtime.cancellation.cancel(taskId, reason);
    runtime.taskManager.updateTask(taskId, {
      stage: 'cancelled',
      status: 'cancelled',
      metadata: { interruptedBy: reason },
    });
    return { ok: true, taskId, reason };
  }

  function resumePersistedWorkflows() {
    const state = runtime.automationPersistence.readState();
    const resumable = (state.workflows || []).filter((workflow) => ['queued', 'running', 'retrying'].includes(workflow.status));
    return resumable;
  }

  return {
    executePrompt,
    interruptTask,
    resumePersistedWorkflows,
  };
}

module.exports = {
  createBackendRuntimeAdapter,
};
