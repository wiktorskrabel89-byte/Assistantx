import type { RuntimeActor } from "@/src/core/types/runtime";

export type ToolRiskLevel = "low" | "medium" | "high";

export type ToolPolicyDefinition = {
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
  scopes: string[];
};

export type ToolAuthorizationResult =
  | { allowed: true }
  | { allowed: false; reason: string };

export function authorizeToolCall(args: {
  actor: RuntimeActor;
  policy: ToolPolicyDefinition;
}): ToolAuthorizationResult {
  const { actor, policy } = args;
  if (!actor.userId) {
    return { allowed: false, reason: "Anonymous tool execution is denied." };
  }

  if (policy.requiresApproval && !actor.organizationId) {
    return {
      allowed: false,
      reason: "High-risk tools require an organization-scoped approval path.",
    };
  }

  return { allowed: true };
}

