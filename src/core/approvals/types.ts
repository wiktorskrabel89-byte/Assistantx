export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export type ApprovalRequest = {
  id: string;
  executionId: string;
  toolId?: string;
  workflowId?: string;
  requestedBy: string;
  organizationId?: string | null;
  reason: string;
  context: Record<string, unknown>;
  status: ApprovalStatus;
  requestedAt: string;
  expiresAt?: string;
  resolvedAt?: string;
  resolvedBy?: string;
};

export type ApprovalResolution = {
  status: "approved" | "rejected";
  resolvedBy: string;
  note?: string;
};
