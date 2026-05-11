import type { RuntimeAgentTask, RuntimeAgentResult } from "@/src/agents/runtime/types";

export type ResearchContext = {
  memoryHits: number;
  sources: string[];
  summary: string;
};

export async function runResearcher(
  task: RuntimeAgentTask,
): Promise<RuntimeAgentResult & { context: ResearchContext }> {
  // Phase-2 scaffold: delegates to memory and search retrieval in subsequent wiring steps.
  const context: ResearchContext = {
    memoryHits: 0,
    sources: [],
    summary: `Research initiated for: ${task.goal}`,
  };

  return {
    taskId: task.id,
    role: "researcher",
    summary: context.summary,
    output: { context },
    context,
  };
}
