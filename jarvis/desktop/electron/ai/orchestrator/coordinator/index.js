'use strict';

const { buildTaskGraph } = require('../workflows');

function createOrchestrationCoordinator({ planner, executor, verifier, retryPolicy, runtime } = {}) {
  async function run(input = {}) {
    const session = runtime?.lifecycle?.beginSession({
      owner: input.owner || 'local',
      modelRoute: input.modelRoute || null,
      memoryContext: input.memoryContext || null,
      permissionScope: input.permissionScope || 'default',
      metadata: input.metadata || {},
    });

    const taskRecord = runtime?.lifecycle?.beginTask({
      owner: input.owner || 'local',
      sessionId: session?.id || null,
      metadata: {
        provider: input.modelRoute?.provider || 'unknown',
      },
    });

    const task = taskRecord?.task;
    if (!taskRecord?.acquired?.ok || !task) {
      return {
        ok: false,
        state: 'failed',
        reason: taskRecord?.acquired?.reason || 'task-not-started',
      };
    }

    try {
      runtime?.taskManager?.updateTask(task.id, { stage: 'planning' });
      const plan = await planner.createPlan(input);
      const graph = buildTaskGraph(plan);

      runtime?.taskManager?.updateTask(task.id, {
        stage: 'executing',
        metadata: {
          requiredTools: plan.requiredTools,
        },
      });

      let workflowState = { retryCount: 0 };
      const executionResults = [];

      while (!graph.isComplete()) {
        const ready = graph.readyNodes();
        if (ready.length === 0) break;

        for (const node of ready) {
          if (runtime?.cancellation?.isCancelled(task.id)) {
            runtime?.lifecycle?.completeTask(task, 'cancelled', { reason: 'cancelled' });
            return {
              ok: false,
              state: 'cancelled',
              task,
              plan,
              graph: graph.snapshot(),
            };
          }

          graph.markRunning(node.id);
          runtime?.bus?.publish('orchestrator.node.running', {
            sessionId: session.id,
            taskId: task.id,
            nodeId: node.id,
            name: node.name,
          });

          const execution = await executor.executeNode(node, {
            sessionId: session.id,
            taskId: task.id,
            correlationId: session.correlationId,
            taskType: input.taskType || 'general',
          });

          const verification = await verifier.verifyNodeExecution(node, execution, {
            taskType: input.taskType || 'general',
          });

          if (execution?.ok === false || verification?.ok === false) {
            graph.markFailed(node.id, verification?.reason || execution?.error || 'node-failed');

            if (retryPolicy.shouldRetryNode(graph.getNode(node.id))) {
              runtime?.taskManager?.incrementRetry(task.id, verification?.reason || execution?.error || 'node-retry');
              graph.resetForRetry(node.id);
              runtime?.bus?.publish('orchestrator.node.retry', {
                sessionId: session.id,
                taskId: task.id,
                nodeId: node.id,
                reason: verification?.reason || execution?.error || 'retry',
              });
              continue;
            }

            if (retryPolicy.shouldRetryWorkflow(workflowState)) {
              workflowState = retryPolicy.nextWorkflowRetry(workflowState);
              runtime?.bus?.publish('orchestrator.workflow.retry', {
                sessionId: session.id,
                taskId: task.id,
                retryCount: workflowState.retryCount,
              });
              for (const failedNode of graph.snapshot().filter((item) => item.status === 'failed')) {
                graph.resetForRetry(failedNode.id);
              }
              continue;
            }

            runtime?.lifecycle?.completeTask(task, 'failed', {
              reason: verification?.reason || execution?.error || 'node-failed',
              graph: graph.snapshot(),
            });
            runtime?.lifecycle?.endSession(session.id);
            return {
              ok: false,
              state: 'failed',
              task,
              plan,
              executionResults,
              graph: graph.snapshot(),
              reason: verification?.reason || execution?.error || 'node-failed',
            };
          }

          executionResults.push({ nodeId: node.id, execution, verification });
          graph.markCompleted(node.id, execution);
          runtime?.bus?.publish('orchestrator.node.completed', {
            sessionId: session.id,
            taskId: task.id,
            nodeId: node.id,
          });
        }
      }

      const state = graph.hasFailures() ? 'failed' : 'completed';
      runtime?.lifecycle?.completeTask(task, state, {
        graph: graph.snapshot(),
      });
      runtime?.lifecycle?.endSession(session.id);

      return {
        ok: state === 'completed',
        state,
        task,
        plan,
        executionResults,
        graph: graph.snapshot(),
      };
    } catch (error) {
      runtime?.lifecycle?.completeTask(task, 'failed', {
        reason: error?.message || 'orchestration-exception',
      });
      runtime?.lifecycle?.endSession(session.id);
      return {
        ok: false,
        state: 'failed',
        error: error?.message || 'orchestration-exception',
      };
    }
  }

  return {
    run,
  };
}

module.exports = { createOrchestrationCoordinator };
