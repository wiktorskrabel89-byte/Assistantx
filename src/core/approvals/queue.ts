import type { ApprovalRequest, ApprovalResolution, ApprovalStatus } from "@/src/core/approvals/types";
import { createEventBus } from "@/src/core/events/event-bus";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";
import { randomUUID } from "node:crypto";

const eventBus = createEventBus();

class ApprovalQueue {
  private readonly queue = new Map<string, ApprovalRequest>();

  async request(
    params: Omit<ApprovalRequest, "id" | "status" | "requestedAt">,
  ): Promise<ApprovalRequest> {
    const approval: ApprovalRequest = {
      ...params,
      id: randomUUID(),
      status: "pending",
      requestedAt: new Date().toISOString(),
    };
    this.queue.set(approval.id, approval);
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
  ): Promise<ApprovalRequest | null> {
    const approval = this.queue.get(approvalId);
    if (!approval) return null;

    const resolved: ApprovalRequest = {
      ...approval,
      status: resolution.status,
      resolvedAt: new Date().toISOString(),
      resolvedBy: resolution.resolvedBy,
    };
    this.queue.set(approvalId, resolved);
    await eventBus.publish({
      type: RUNTIME_EVENT_TYPES.APPROVAL_RESOLVED,
      timestamp: resolved.resolvedAt ?? new Date().toISOString(),
      actorUserId: resolution.resolvedBy,
      organizationId: approval.organizationId,
      executionId: approval.executionId,
      payload: {
        approvalId,
        status: resolution.status,
        note: resolution.note,
      },
    });
    return resolved;
  }

  get(approvalId: string): ApprovalRequest | undefined {
    return this.queue.get(approvalId);
  }

  listForOrg(organizationId: string, status?: ApprovalStatus): ApprovalRequest[] {
    return [...this.queue.values()].filter(
      (a) =>
        a.organizationId === organizationId &&
        (status === undefined || a.status === status),
    );
  }
}

export const approvalQueue = new ApprovalQueue();
