/**
 * Inngest Function: workflow.execute
 *
 * Durable workflow execution with automatic retries, checkpoints, and
 * persisted state.  This replaces the fire-and-forget facade behavior.
 *
 * Steps are individually retried by Inngest — if the process crashes after
 * step 1 completes, execution resumes at step 2 on the next retry.
 */

import { inngest } from "@/src/core/events/inngest-client";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";

export type WorkflowExecuteEvent = {
  name: typeof RUNTIME_EVENT_TYPES.WORKFLOW_STARTED;
  data: {
    executionId: string;
    workflow: string;
    input: Record<string, unknown>;
    actorUserId: string | null;
    organizationId: string | null;
    sessionId?: string | null;
    timestamp: string;
    payload: Record<string, unknown>;
  };
};

export const workflowExecuteFunction = inngest.createFunction(
  {
    id: "workflow-execute",
    name: "Execute Workflow",
    triggers: [{ event: RUNTIME_EVENT_TYPES.WORKFLOW_STARTED }],
    retries: 3,
    // Cancel if a WORKFLOW_CANCELLED event arrives for the same execution.
    cancelOn: [
      {
        event: RUNTIME_EVENT_TYPES.WORKFLOW_CANCELLED,
        match: "data.executionId",
      },
    ],
  },
  async ({ event, step }) => {
    const { executionId, workflow, input, actorUserId, organizationId } =
      event.data;

    // ── STEP 1: Mark run as RUNNING ─────────────────────────────────────────
    await step.run("update-status-running", async () => {
      const { updateWorkflowRun } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await updateWorkflowRun(executionId, { status: "running" });
    });

    // ── STEP 2: Run coordinator agent task ──────────────────────────────────
    const agentResult = await step.run("run-coordinator", async () => {
      const { runAgentTask } = await import(
        "@/src/agents/runtime/coordinator"
      );
      return runAgentTask({
        id: `${executionId}:coordinator`,
        role: "coordinator",
        goal: workflow,
        input,
      });
    });

    // ── STEP 3: Run verifier gate ────────────────────────────────────────────
    const verification = await step.run("run-verifier", async () => {
      const { runVerifier } = await import("@/src/agents/runtime/verifier");
      const task = {
        id: `${executionId}:verifier`,
        role: "verifier" as const,
        goal: workflow,
        input: agentResult.output,
      };
      return runVerifier(task, agentResult.output);
    });

    // ── STEP 4: Persist final result ─────────────────────────────────────────
    await step.run("persist-result", async () => {
      const { updateWorkflowRun } = await import(
        "@/src/core/persistence/runtime-db"
      );

      const safe = verification.safe;
      const finalStatus = safe ? "completed" : "failed";
      const finalError = safe
        ? null
        : `Verifier rejected output: ${verification.reasons.join("; ")}`;

      await updateWorkflowRun(executionId, {
        status: finalStatus,
        output: safe
          ? {
              workflow,
              agent: agentResult,
              verification: { safe, reasons: verification.reasons },
            }
          : null,
        error: finalError,
        completed_at: new Date().toISOString(),
      });

      return { finalStatus, finalError };
    });

    // ── STEP 5: Send lifecycle event ─────────────────────────────────────────
    await step.run("emit-completed-event", async () => {
      const safe = verification.safe;
      const eventType = safe
        ? RUNTIME_EVENT_TYPES.WORKFLOW_COMPLETED
        : RUNTIME_EVENT_TYPES.WORKFLOW_FAILED;

      await inngest.send({
        name: eventType,
        data: {
          executionId,
          workflow,
          actorUserId,
          organizationId,
          payload: { workflow, safe, reasons: verification.reasons },
          timestamp: new Date().toISOString(),
        },
      });
    });

    return {
      executionId,
      workflow,
      safe: verification.safe,
      agentSummary: agentResult.summary,
    };
  },
);
