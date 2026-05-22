/**
 * Inngest Function: runtime-notification-handler
 *
 * Central cloud-side event handler.  Listens to terminal runtime events
 * emitted by the workflow executor, Inngest functions, and the runtime
 * facade, then writes idempotent notification rows to Supabase.
 *
 * Design principles (cloud-first multi-tenant):
 *   - Every notification is keyed by user_id — RLS enforces tenant isolation.
 *   - Deduplication: dedupKey = executionId:EVENT_TYPE prevents duplicate rows
 *     when Inngest retries the function after a transient failure.
 *   - TTS is NOT synthesised here; speech_text is written to the DB row and
 *     consumed client-side (browser Web Speech API or Electron sidecar).
 *   - Approval-needed and workflow-failure events carry a speech_text payload
 *     (high-priority, should be spoken).  Task-level completions are silent.
 *
 * Triggered by:
 *   WORKFLOW_COMPLETED  — terminal success
 *   WORKFLOW_FAILED     — terminal failure
 *   WORKFLOW_CANCELLED  — cancelled run
 *   TASK_COMPLETED      — agent sub-task done (silent, inbox only)
 *   APPROVAL_REQUESTED  — human approval needed (spoken + inbox)
 */

import { inngest } from "@/src/core/events/inngest-client";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";
import { writeNotification } from "@/src/core/notifications/notification-service";

// ─── Internal event data shapes ───────────────────────────────────────────────

type WorkflowTerminalData = {
  executionId: string;
  workflow?: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  payload?: Record<string, unknown>;
  timestamp: string;
};

type TaskCompletedData = {
  taskId: string;
  executionId: string;
  role?: string;
  summary?: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  timestamp: string;
};

type ApprovalRequestedData = {
  executionId: string;
  approvalId: string;
  toolId?: string;
  workflowId?: string;
  requestedBy?: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  reason?: string;
  timestamp: string;
};

// ─── Deep-link helper ─────────────────────────────────────────────────────────

function runDeepLink(executionId: string): string {
  return `/api/v1/runs?executionId=${encodeURIComponent(executionId)}`;
}

// ─── Per-event handlers ───────────────────────────────────────────────────────

async function handleWorkflowCompleted(d: WorkflowTerminalData): Promise<void> {
  const userId = d.actorUserId;
  if (!userId) return;

  const label = d.workflow ?? d.executionId;
  await writeNotification({
    userId,
    organizationId: d.organizationId,
    kind: "success",
    title: "Workflow completed",
    body: `Workflow "${label}" finished successfully.`,
    speechText: `Done. Workflow ${label} completed.`,
    source: "inngest",
    executionId: d.executionId,
    deepLink: runDeepLink(d.executionId),
    metadata: { workflow: d.workflow ?? null },
    dedupKey: `${d.executionId}:WORKFLOW_COMPLETED`,
  });
}

async function handleWorkflowFailed(d: WorkflowTerminalData): Promise<void> {
  const userId = d.actorUserId;
  if (!userId) return;

  const label = d.workflow ?? d.executionId;
  const errorMsg = typeof d.payload?.error === "string" ? d.payload.error : "";
  await writeNotification({
    userId,
    organizationId: d.organizationId,
    kind: "warning",
    title: "Workflow failed",
    body: errorMsg
      ? `Workflow "${label}" failed: ${errorMsg}`
      : `Workflow "${label}" failed.`,
    speechText: `Attention. Workflow ${label} failed.`,
    source: "inngest",
    executionId: d.executionId,
    deepLink: runDeepLink(d.executionId),
    metadata: { workflow: d.workflow ?? null, error: errorMsg || null },
    dedupKey: `${d.executionId}:WORKFLOW_FAILED`,
  });
}

async function handleWorkflowCancelled(d: WorkflowTerminalData): Promise<void> {
  const userId = d.actorUserId;
  if (!userId) return;

  const label = d.workflow ?? d.executionId;
  await writeNotification({
    userId,
    organizationId: d.organizationId,
    kind: "info",
    title: "Workflow cancelled",
    body: `Workflow "${label}" was cancelled.`,
    speechText: null,
    source: "inngest",
    executionId: d.executionId,
    deepLink: runDeepLink(d.executionId),
    metadata: { workflow: d.workflow ?? null },
    dedupKey: `${d.executionId}:WORKFLOW_CANCELLED`,
  });
}

async function handleTaskCompleted(d: TaskCompletedData): Promise<void> {
  const userId = d.actorUserId;
  if (!userId) return;

  const roleLabel = d.role ?? "task";
  await writeNotification({
    userId,
    organizationId: d.organizationId,
    kind: "info",
    title: "Agent task completed",
    body: d.summary
      ? `Agent (${roleLabel}) finished: ${d.summary}`
      : `Agent task (${roleLabel}) completed.`,
    speechText: null, // task-level completions are silent by policy
    source: "inngest",
    executionId: d.executionId,
    taskId: d.taskId,
    deepLink: runDeepLink(d.executionId),
    metadata: { role: d.role ?? null, taskId: d.taskId },
    dedupKey: `${d.taskId}:TASK_COMPLETED`,
  });
}

async function handleApprovalRequested(
  d: ApprovalRequestedData,
): Promise<void> {
  // Notify the workflow owner; fall back to the requesting user.
  const userId = d.actorUserId ?? d.requestedBy;
  if (!userId) return;

  const actionLabel = d.toolId ?? d.workflowId ?? "action";
  await writeNotification({
    userId,
    organizationId: d.organizationId,
    kind: "warning",
    title: "Approval required",
    body: d.reason
      ? `Approval needed for "${actionLabel}": ${d.reason}`
      : `Approval needed for "${actionLabel}".`,
    speechText: `Attention. Approval required for ${actionLabel}.`,
    source: "inngest",
    executionId: d.executionId,
    deepLink: runDeepLink(d.executionId),
    metadata: {
      approvalId: d.approvalId,
      toolId: d.toolId ?? null,
      workflowId: d.workflowId ?? null,
    },
    dedupKey: `${d.approvalId}:APPROVAL_REQUESTED`,
  });
}

// ─── Inngest function registration ────────────────────────────────────────────

export const runtimeNotificationHandlerFunction = inngest.createFunction(
  {
    id: "runtime-notification-handler",
    name: "Runtime Notification Handler",
    triggers: [
      { event: RUNTIME_EVENT_TYPES.WORKFLOW_COMPLETED },
      { event: RUNTIME_EVENT_TYPES.WORKFLOW_FAILED },
      { event: RUNTIME_EVENT_TYPES.WORKFLOW_CANCELLED },
      { event: RUNTIME_EVENT_TYPES.TASK_COMPLETED },
      { event: RUNTIME_EVENT_TYPES.APPROVAL_REQUESTED },
    ],
    // Retries are safe because writeNotification is idempotent via dedupKey.
    retries: 3,
  },
  async ({ event, step }) => {
    const eventType = event.name;
    const data = event.data as Record<string, unknown>;

    await step.run("write-notification", async () => {
      switch (eventType) {
        case RUNTIME_EVENT_TYPES.WORKFLOW_COMPLETED:
          await handleWorkflowCompleted(data as WorkflowTerminalData);
          break;
        case RUNTIME_EVENT_TYPES.WORKFLOW_FAILED:
          await handleWorkflowFailed(data as WorkflowTerminalData);
          break;
        case RUNTIME_EVENT_TYPES.WORKFLOW_CANCELLED:
          await handleWorkflowCancelled(data as WorkflowTerminalData);
          break;
        case RUNTIME_EVENT_TYPES.TASK_COMPLETED:
          await handleTaskCompleted(data as TaskCompletedData);
          break;
        case RUNTIME_EVENT_TYPES.APPROVAL_REQUESTED:
          await handleApprovalRequested(data as ApprovalRequestedData);
          break;
        default:
          break;
      }
    });

    return { handled: eventType };
  },
);
