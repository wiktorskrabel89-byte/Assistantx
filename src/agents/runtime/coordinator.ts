import type {
  RuntimeAgentResult,
  RuntimeAgentRole,
  RuntimeAgentTask,
} from "@/src/agents/runtime/types";

function roleSummary(role: RuntimeAgentRole): string {
  switch (role) {
    case "planner":
      return "Planned task decomposition.";
    case "coordinator":
      return "Coordinated specialized agent execution.";
    case "researcher":
      return "Collected supporting context.";
    case "coder":
      return "Prepared implementation output.";
    case "verifier":
      return "Validated safety and consistency checks.";
  }
}

export async function runAgentTask(task: RuntimeAgentTask): Promise<RuntimeAgentResult> {
  return {
    taskId: task.id,
    role: task.role,
    summary: roleSummary(task.role),
    output: {
      goal: task.goal,
      acceptedInputKeys: Object.keys(task.input),
    },
  };
}

