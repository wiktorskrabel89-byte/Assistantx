/**
 * Inngest Function: approval.requested / approval.resolved
 *
 * Handles the durable approval lifecycle for high-risk tool executions.
 *
 * Flow:
 *   TOOL_APPROVAL_REQUIRED → persist approval request → wait for resolution
 *   → resume workflow on APPROVAL_RESOLVED
 *
 * The function blocks the workflow in `waiting_for_approval` state and
 * resumes automatically when an admin resolves the approval.
 *
 * Expiry: Approvals expire after 24 hours by default.  Expired approvals
 * transition the workflow run to "expired".
 */

import { inngest } from "@/src/core/events/inngest-client";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";

/** How long (ms) to wait for approval before auto-expiring. */
const APPROVAL_EXPIRY_MS = 24 * 60 * 60 * 1000; // 24 hours

export type ApprovalRequestedEvent = {
  name: typeof RUNTIME_EVENT_TYPES.APPROVAL_REQUESTED;
  data: {
    executionId: string;
    approvalId: string;
    toolId?: string;
    workflowId?: string;
    requestedBy: string;
    organizationId?: string | null;
    reason: string;
    context: Record<string, unknown>;
    timestamp: string;
    actorUserId?: string | null;
    payload: Record<string, unknown>;
  };
};

export type ApprovalResolvedEvent = {
  name: typeof RUNTIME_EVENT_TYPES.APPROVAL_RESOLVED;
  data: {
    approvalId: string;
    executionId: string;
    status: "approved" | "rejected";
    resolvedBy: string;
    note?: string;
    timestamp: string;
    actorUserId?: string | null;
    organizationId?: string | null;
    payload: Record<string, unknown>;
  };
};

export const approvalRequestedFunction = inngest.createFunction(
  {
    id: "approval-requested",
    name: "Handle Approval Request",
    triggers: [{ event: RUNTIME_EVENT_TYPES.APPROVAL_REQUESTED }],
    retries: 1,
  },
  async ({ event, step }) => {
    const {
      executionId,
      approvalId,
      toolId,
      workflowId,
      requestedBy,
      organizationId,
      reason,
      context,
    } = event.data;

    // ── STEP 1: Update workflow run to waiting_for_approval ─────────────────
    await step.run("update-status-waiting", async () => {
      const { updateWorkflowRun } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await updateWorkflowRun(executionId, { status: "waiting_for_approval" });
    });

    // ── STEP 2: Persist approval request record ──────────────────────────────
    await step.run("persist-approval-request", async () => {
      const { insertApprovalRequest } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await insertApprovalRequest({
        id: approvalId,
        execution_id: executionId,
        tool_id: toolId ?? null,
        workflow_id: workflowId ?? null,
        requested_by: requestedBy,
        organization_id: organizationId ?? null,
        reason,
        context,
        status: "pending",
        expires_at: new Date(Date.now() + APPROVAL_EXPIRY_MS).toISOString(),
      });
    });

    // ── STEP 3: Wait for APPROVAL_RESOLVED or expiry ─────────────────────────
    const resolution = await step.waitForEvent(
      "wait-for-approval-resolution",
      {
        event: RUNTIME_EVENT_TYPES.APPROVAL_RESOLVED,
        match: "data.approvalId",
        timeout: `${APPROVAL_EXPIRY_MS}ms`,
      },
    );

    if (!resolution) {
      // Approval timed out — expire the run.
      await step.run("expire-on-timeout", async () => {
        const { updateWorkflowRun, updateApprovalRequest } = await import(
          "@/src/core/persistence/runtime-db"
        );
        await updateApprovalRequest(approvalId, "expired");
        await updateWorkflowRun(executionId, { status: "expired" });
      });

      return { approvalId, outcome: "expired" };
    }

    // ── STEP 4: Persist resolution ───────────────────────────────────────────
    const rawStatus = resolution.data.status;
    // Runtime validation: only accept known resolution statuses.
    if (rawStatus !== "approved" && rawStatus !== "rejected") {
      throw new Error(
        `Invalid approval resolution status: "${rawStatus}". Expected "approved" or "rejected" for resolution.`,
      );
    }
    const { resolvedBy, note } = resolution.data;
    const resolvedStatus = rawStatus;
    await step.run("persist-resolution", async () => {
      const { updateApprovalRequest, updateWorkflowRun } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await updateApprovalRequest(approvalId, resolvedStatus, resolvedBy, note);

      // Resume or fail the workflow run based on resolution.
      const newStatus = resolvedStatus === "approved" ? "running" : "failed";
      await updateWorkflowRun(executionId, {
        status: newStatus,
        error: resolvedStatus === "rejected"
          ? `Approval rejected by ${resolvedBy}: ${note ?? "no reason given"}`
          : null,
      });
    });

    // ── STEP 5: Emit result event ────────────────────────────────────────────
    await step.run("emit-resolution-result", async () => {
      await inngest.send({
        name: RUNTIME_EVENT_TYPES.APPROVAL_RESOLVED,
        data: {
          executionId,
          approvalId,
          status: resolvedStatus,
          resolvedBy,
          note,
          timestamp: new Date().toISOString(),
          organizationId,
          payload: { status: resolvedStatus, resolvedBy, note },
        },
      });
    });

    return { approvalId, outcome: resolvedStatus };
  },
);
