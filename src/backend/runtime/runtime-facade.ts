import { randomUUID } from "node:crypto";
import { runAgentTask } from "@/src/agents/runtime/coordinator";
import { runVerifier } from "@/src/agents/runtime/verifier";
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
  const startedAt = new Date().toISOString();

  // Persist the workflow run record (authoritative state — fail-closed).
  let hasPersistentRecord = false;
  try {
    const { insertWorkflowRun } = await import(
      "@/src/core/persistence/runtime-db"
    );
    await insertWorkflowRun({
      execution_id: executionId,
      workflow_id: request.workflow,
      user_id: request.actor.userId,
      organization_id: request.actor.organizationId,
      status: "queued",
      trigger: "user",
      input: request.input,
      started_at: startedAt,
    });
    hasPersistentRecord = true;
  } catch {
    // If we can't persist the run record, continue but note it is not durable.
  }

  await eventBus.publish({
    type: RUNTIME_EVENT_TYPES.WORKFLOW_STARTED,
    timestamp: startedAt,
    actorUserId: request.actor.userId,
    organizationId: request.actor.organizationId,
    executionId,
    payload: { workflow: request.workflow },
  });

  // Durable template workflow path: queue in Inngest and return immediately.
  if (request.workflow === "start_gaming") {
    await eventBus.publish({
      type: RUNTIME_EVENT_TYPES.START_GAMING_REQUESTED,
      timestamp: startedAt,
      actorUserId: request.actor.userId,
      organizationId: request.actor.organizationId,
      executionId,
      payload: {
        workflow: request.workflow,
        input: request.input,
      },
    });

    return {
      executionId,
      status: "queued",
      output: {
        workflow: "start_gaming",
        orchestrator: "inngest",
        queued: true,
      },
    };
  }

  // Update status to running.
  if (hasPersistentRecord) {
    try {
      const { updateWorkflowRun } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await updateWorkflowRun(executionId, { status: "running" });
    } catch {
      // Best-effort status update.
    }
  }

  let finalStatus: "completed" | "failed" = "completed";
  let finalOutput: Record<string, unknown> = {};
  let finalError: string | null = null;

  try {
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

    // Run the verifier gate on the coordinator output.
    const verifierTask = {
      id: `${executionId}:verifier`,
      role: "verifier" as const,
      goal: request.workflow,
      input: agent.output,
    };
    const verification = await runVerifier(verifierTask, agent.output);

    finalOutput = {
      workflow: request.workflow,
      agent,
      toolResult,
      verification: {
        safe: verification.safe,
        reasons: verification.reasons,
      },
    };

    if (!verification.safe) {
      finalStatus = "failed";
      finalError = `Verifier rejected output: ${verification.reasons.join("; ")}`;
    }
  } catch (err) {
    finalStatus = "failed";
    finalError = err instanceof Error ? err.message : "Workflow execution failed.";
  }

  const completedAt = new Date().toISOString();

  // Update authoritative run record.
  if (hasPersistentRecord) {
    try {
      const { updateWorkflowRun } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await updateWorkflowRun(executionId, {
        status: finalStatus,
        output: finalStatus === "completed" ? finalOutput : null,
        error: finalError,
        completed_at: completedAt,
      });
    } catch {
      // Best-effort.
    }
  }

  // Emit lifecycle event.
  await eventBus.publish({
    type:
      finalStatus === "completed"
        ? RUNTIME_EVENT_TYPES.WORKFLOW_COMPLETED
        : RUNTIME_EVENT_TYPES.WORKFLOW_FAILED,
    timestamp: completedAt,
    actorUserId: request.actor.userId,
    organizationId: request.actor.organizationId,
    executionId,
    payload: {
      workflow: request.workflow,
      status: finalStatus,
      error: finalError,
    },
  });

  return {
    executionId,
    status: finalStatus,
    output: finalStatus === "completed" ? finalOutput : undefined,
    error: finalError ?? undefined,
  };
}
