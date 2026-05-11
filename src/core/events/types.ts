export const RUNTIME_EVENT_TYPES = {
  TASK_CREATED: "TASK_CREATED",
  TASK_COMPLETED: "TASK_COMPLETED",
  AGENT_STARTED: "AGENT_STARTED",
  TOOL_EXECUTED: "TOOL_EXECUTED",
  POLICY_DENIED: "POLICY_DENIED",
  MEMORY_UPDATED: "MEMORY_UPDATED",
  WORKFLOW_STARTED: "WORKFLOW_STARTED",
  WORKFLOW_COMPLETED: "WORKFLOW_COMPLETED",
} as const;

export type RuntimeEventType = (typeof RUNTIME_EVENT_TYPES)[keyof typeof RUNTIME_EVENT_TYPES];

export type RuntimeEvent = {
  type: RuntimeEventType;
  timestamp: string;
  actorUserId?: string | null;
  organizationId?: string | null;
  executionId?: string;
  payload: Record<string, unknown>;
};

