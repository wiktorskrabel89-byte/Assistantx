import type { ApprovalRequest, ApprovalResolution, ApprovalStatus } from "@/src/core/approvals/types";
import { createEventBus } from "@/src/core/events/event-bus";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";
import { randomUUID } from "node:crypto";

const eventBus = createEventBus();

/**
 * Approval Queue — Phase 2 persistent implementation.
 *
 * Approvals are persisted to `approval_requests` in Supabase.
 * In-memory fallback is used when the DB write fails so the runtime
 * remains functional during connectivity issues (fail-open for UX,
 * not for security — Inngest holds the approval state durably).
 */
class ApprovalQueue {
  /** In-memory fallback for cases where DB is unreachable. */
  private readonly fallback = new Map<string, ApprovalRequest>();

  async request(
    params: Omit<ApprovalRequest, "id" | "status" | "requestedAt">,
  ): Promise<ApprovalRequest> {
    const approval: ApprovalRequest = {
      ...params,
      id: randomUUID(),
      status: "pending",
      requestedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    };

    // Persist to DB (fail-open: keep in-memory fallback on error).
    try {
      const { insertApprovalRequest } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await insertApprovalRequest({
        id: approval.id,
        execution_id: approval.executionId,
        tool_id: approval.toolId ?? null,
        workflow_id: approval.workflowId ?? null,
        requested_by: approval.requestedBy,
        organization_id: approval.organizationId ?? null,
        reason: approval.reason,
        context: approval.context,
        status: approval.status,
        expires_at: approval.expiresAt ?? null,
      });
    } catch {
      this.fallback.set(approval.id, approval);
    }

    await eventBus.publish({
      type: RUNTIME_EVENT_TYPES.APPROVAL_REQUESTED,
      timestamp: approval.requestedAt,
      actorUserId: approval.requestedBy,
      organizationId: approval.organizationId,
      executionId: approval.executionId,
      payload: {
        approvalId: approval.id,
        toolId: approval.toolId,
        workflowId: approval.workflowId,
        reason: approval.reason,
      },
    });
    return approval;
  }

  async resolve(
    approvalId: string,
    resolution: ApprovalResolution,
    context?: { organizationId?: string | null; executionId?: string },
  ): Promise<ApprovalRequest | null> {
    // Try DB-backed resolution first.
    try {
      const { updateApprovalRequest } = await import(
        "@/src/core/persistence/runtime-db"
      );
      await updateApprovalRequest(
        approvalId,
        resolution.status,
        resolution.resolvedBy,
        resolution.note,
      );
    } catch {
      // Update fallback if DB is unavailable.
      const fallback = this.fallback.get(approvalId);
      if (fallback) {
        const resolved: ApprovalRequest = {
          ...fallback,
          status: resolution.status,
          resolvedAt: new Date().toISOString(),
          resolvedBy: resolution.resolvedBy,
        };
        this.fallback.set(approvalId, resolved);
      }
    }

    // Reconstruct a response object for callers.
    const resolvedAt = new Date().toISOString();
    const fallbackEntry = this.fallback.get(approvalId);
    const orgId = context?.organizationId ?? fallbackEntry?.organizationId;
    const execId = context?.executionId ?? fallbackEntry?.executionId;

    await eventBus.publish({
      type: RUNTIME_EVENT_TYPES.APPROVAL_RESOLVED,
      timestamp: resolvedAt,
      actorUserId: resolution.resolvedBy,
      organizationId: orgId ?? null,
      executionId: execId,
      payload: {
        approvalId,
        status: resolution.status,
        note: resolution.note,
      },
    });

    if (fallbackEntry) {
      return {
        ...fallbackEntry,
        status: resolution.status,
        resolvedAt,
        resolvedBy: resolution.resolvedBy,
      };
    }

    return null;
  }

  get(approvalId: string): ApprovalRequest | undefined {
    return this.fallback.get(approvalId);
  }

  listForOrg(organizationId: string, status?: ApprovalStatus): ApprovalRequest[] {
    return [...this.fallback.values()].filter(
      (a) =>
        a.organizationId === organizationId &&
        (status === undefined || a.status === status),
    );
  }
}

export const approvalQueue = new ApprovalQueue();
