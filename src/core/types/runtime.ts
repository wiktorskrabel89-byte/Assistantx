export type RuntimeExecutionStatus =
  | "queued"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed";

export type RuntimeActor = {
  userId: string | null;
  organizationId: string | null;
  sessionId: string | null;
};

export type RuntimeExecutionContext = {
  executionId: string;
  workflowId: string;
  actor: RuntimeActor;
  metadata?: Record<string, unknown>;
};

export type RuntimeExecutionResult<T = unknown> = {
  executionId: string;
  status: RuntimeExecutionStatus;
  output?: T;
  error?: string;
};

export type RuntimeExecutionRequest = {
  workflow: string;
  input: Record<string, unknown>;
  actor: RuntimeActor;
};

