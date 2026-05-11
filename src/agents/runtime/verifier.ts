import type { RuntimeAgentTask, RuntimeAgentResult } from "@/src/agents/runtime/types";

export async function runVerifier(
  task: RuntimeAgentTask,
  candidateOutput: Record<string, unknown>,
): Promise<RuntimeAgentResult & { safe: boolean; reasons: string[] }> {
  const reasons: string[] = [];
  let safe = true;

  // Schema check: ensure output is a plain object
  if (typeof candidateOutput !== "object" || Array.isArray(candidateOutput)) {
    reasons.push("Output is not a plain object — rejected.");
    safe = false;
  }

  // Injection guard: reject outputs containing script-like patterns
  const serialized = JSON.stringify(candidateOutput ?? {});
  if (/<script|eval\(|function\s*\(|__proto__/i.test(serialized)) {
    reasons.push("Potential script injection pattern detected in output.");
    safe = false;
  }

  return {
    taskId: task.id,
    role: "verifier",
    summary: safe
      ? "Output passed verification checks."
      : `Output failed verification: ${reasons.join("; ")}`,
    output: {
      safe,
      reasons,
      checkedKeys: Object.keys(candidateOutput ?? {}),
    },
    safe,
    reasons,
  };
}
