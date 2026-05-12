export type RuntimeAgentRole =
  | "planner"
  | "coordinator"
  | "researcher"
  | "coder"
  | "verifier";

export type RuntimeAgentTask = {
  id: string;
  role: RuntimeAgentRole;
  goal: string;
  input: Record<string, unknown>;
};

export type RuntimeAgentResult = {
  taskId: string;
  role: RuntimeAgentRole;
  summary: string;
  output: Record<string, unknown>;
};

