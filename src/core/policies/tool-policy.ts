import type { RuntimeActor } from "@/src/core/types/runtime";

export type ToolRiskLevel = "low" | "medium" | "high" | "critical";

/**
 * Execution sandbox tier determines the isolation level for tool execution.
 *
 * - trusted: built-in tools with full runtime access
 * - verified: community plugins that passed review; limited scope
 * - sandboxed: untrusted or unreviewed plugins/MCP tools; fully isolated worker
 */
export type ExecutionTier = "trusted" | "verified" | "sandboxed";

export type ToolPolicyDefinition = {
  requiresApproval: boolean;
  riskLevel: ToolRiskLevel;
  scopes: string[];
  /**
   * When true, the tool execution is irreversible (deploy, delete, push).
   * Irreversible tools always require approval regardless of `requiresApproval`.
   */
  irreversible?: boolean;
  /** Execution sandbox tier.  Defaults to "trusted" for built-in tools. */
  executionTier?: ExecutionTier;
  /** Maximum wall-clock execution time in milliseconds. */
  timeoutMs?: number;
};

export type ToolAuthorizationResult =
  | { allowed: true }
  | { allowed: false; reason: string; requiresApproval?: boolean };

/**
 * Authorize a tool call against actor identity and policy definition.
 *
 * Rules (in order of priority):
 * 1. Anonymous actors are always denied.
 * 2. Irreversible tools are always denied without an org approval path.
 * 3. High/critical risk tools require org membership.
 * 4. Tools that requiresApproval need an org approval path.
 */
export function authorizeToolCall(args: {
  actor: RuntimeActor;
  policy: ToolPolicyDefinition;
}): ToolAuthorizationResult {
  const { actor, policy } = args;

  if (!actor.userId) {
    return { allowed: false, reason: "Anonymous tool execution is denied." };
  }

  if (policy.irreversible && !actor.organizationId) {
    return {
      allowed: false,
      reason: "Irreversible tools require an organization-scoped approval path.",
      requiresApproval: true,
    };
  }

  if (
    (policy.riskLevel === "high" || policy.riskLevel === "critical") &&
    !actor.organizationId
  ) {
    return {
      allowed: false,
      reason: `${policy.riskLevel} risk tools require organization membership.`,
    };
  }

  if (policy.requiresApproval && !actor.organizationId) {
    return {
      allowed: false,
      reason: "High-risk tools require an organization-scoped approval path.",
      requiresApproval: true,
    };
  }

  return { allowed: true };
}

