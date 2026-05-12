import type { RuntimeAgentRole, RuntimeAgentTask } from "@/src/agents/runtime/types";
import { randomUUID } from "node:crypto";

export type SubtaskSpec = {
  role: RuntimeAgentRole;
  goal: string;
  dependsOn?: string[];
};

export type DecompositionPlan = {
  planId: string;
  parentGoal: string;
  subtasks: RuntimeAgentTask[];
};

export function decomposeGoal(goal: string, specs: SubtaskSpec[]): DecompositionPlan {
  const planId = randomUUID();
  const subtasks: RuntimeAgentTask[] = specs.map((spec) => ({
    id: randomUUID(),
    role: spec.role,
    goal: spec.goal,
    input: {
      parentGoal: goal,
      planId,
      dependsOn: spec.dependsOn ?? [],
    },
  }));

  return {
    planId,
    parentGoal: goal,
    subtasks,
  };
}
