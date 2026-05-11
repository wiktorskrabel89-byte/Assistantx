import { randomUUID } from "node:crypto";
import { runAgentTask } from "@/src/agents/runtime/coordinator";
import { createEventBus } from "@/src/core/events/event-bus";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";
import type {
  RuntimeExecutionRequest,
  RuntimeExecutionResult,
} from "@/src/core/types/runtime";
import { ToolRouter } from "@/src/tools/router/router";

function createExecutionId() {
  return randomUUID();
}

export async function executeRuntimeRequest(
  request: RuntimeExecutionRequest,
): Promise<RuntimeExecutionResult<Record<string, unknown>>> {
  const executionId = createExecutionId();
  const eventBus = createEventBus();
  const toolRouter = new ToolRouter();

  await eventBus.publish({
    type: RUNTIME_EVENT_TYPES.WORKFLOW_STARTED,
    timestamp: new Date().toISOString(),
    actorUserId: request.actor.userId,
    organizationId: request.actor.organizationId,
    executionId,
    payload: { workflow: request.workflow },
  });

  const agent = await runAgentTask({
    id: `${executionId}:coordinator`,
    role: "coordinator",
    goal: request.workflow,
    input: request.input,
  });

  const toolResult = await toolRouter.execute(
    {
      toolId: "memory.read",
      input: request.input,
    },
    {
      executionId,
      workflowId: request.workflow,
      actor: request.actor,
      metadata: { source: "runtime-facade" },
    },
  );

  await eventBus.publish({
    type: RUNTIME_EVENT_TYPES.WORKFLOW_COMPLETED,
    timestamp: new Date().toISOString(),
    actorUserId: request.actor.userId,
    organizationId: request.actor.organizationId,
    executionId,
    payload: {
      workflow: request.workflow,
      toolOk: toolResult.ok,
      agentRole: agent.role,
    },
  });

  return {
    executionId,
    status: "completed",
    output: {
      workflow: request.workflow,
      agent,
      toolResult,
    },
  };
}
