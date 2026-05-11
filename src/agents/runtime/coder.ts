import type { RuntimeAgentTask, RuntimeAgentResult } from "@/src/agents/runtime/types";

export type CodingOutput = {
  language: string;
  artifacts: string[];
  requiresReview: boolean;
};

export async function runCoder(
  task: RuntimeAgentTask,
): Promise<RuntimeAgentResult & { coding: CodingOutput }> {
  const preferredLang =
    typeof task.input.preferredLanguage === "string"
      ? task.input.preferredLanguage
      : "typescript";

  const coding: CodingOutput = {
    language: preferredLang,
    artifacts: [],
    requiresReview: true,
  };

  return {
    taskId: task.id,
    role: "coder",
    summary: `Coding task accepted for goal: ${task.goal}`,
    output: { coding },
    coding,
  };
}
