/**
 * Inngest Function: agent.task
 *
 * Durable agent task execution.  Each agent role runs as a persisted step
 * so subtask history, retries, failures, and outputs are recoverable.
 *
 * Triggered by AGENT_STARTED events and persists results to `agent_tasks`.
 */

import { inngest } from "@/src/core/events/inngest-client";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";
import type { RuntimeAgentRole } from "@/src/agents/runtime/types";

export type AgentStartedEvent = {
  name: typeof RUNTIME_EVENT_TYPES.AGENT_STARTED;
  data: {
    taskId: string;
    executionId: string;
    role: RuntimeAgentRole;
    goal: string;
    input: Record<string, unknown>;
    actorUserId: string | null;
    organizationId: string | null;
    timestamp: string;
    payload: Record<string, unknown>;
  };
};

export const agentTaskFunction = inngest.createFunction(
  {
    id: "agent-task",
    name: "Run Agent Task",
    triggers: [{ event: RUNTIME_EVENT_TYPES.AGENT_STARTED }],
    retries: 2,
  },
  async ({ event, step }) => {
    const { taskId, executionId, role, goal, input, actorUserId, organizationId } =
      event.data;

    // ── STEP 1: Persist task as 'running' ────────────────────────────────────
    await step.run("persist-task-start", async () => {
      const { insertAgentTask } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await insertAgentTask({
        task_id: taskId,
        execution_id: executionId,
        role,
        goal,
        input,
        user_id: actorUserId,
        organization_id: organizationId,
        status: "running",
      });
    });

    // ── STEP 2: Execute the role-specific agent ──────────────────────────────
    const agentResult = await step.run("run-agent-role", async () => {
      if (role === "verifier") {
        const { runVerifier } = await import("@/src/agents/runtime/verifier");
        return runVerifier({ id: taskId, role, goal, input }, input);
      }
      const { runAgentTask } = await import("@/src/agents/runtime/coordinator");
      return runAgentTask({ id: taskId, role, goal, input });
    });

    // ── STEP 3: Persist result ───────────────────────────────────────────────
    await step.run("persist-task-result", async () => {
      const { updateAgentTask } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await updateAgentTask(taskId, {
        status: "completed",
        output: agentResult.output,
        completed_at: new Date().toISOString(),
      });
    });

    // ── STEP 4: Emit completion event ────────────────────────────────────────
    await step.run("emit-task-completed", async () => {
      await inngest.send({
        name: RUNTIME_EVENT_TYPES.TASK_COMPLETED,
        data: {
          taskId,
          executionId,
          role,
          summary: agentResult.summary,
          actorUserId,
          organizationId,
          payload: { taskId, role, summary: agentResult.summary },
          timestamp: new Date().toISOString(),
        },
      });
    });

    return { taskId, role, summary: agentResult.summary };
  },
);
