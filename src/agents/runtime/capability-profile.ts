import type { RuntimeAgentRole } from "@/src/agents/runtime/types";

export type AgentCapabilityProfile = {
  role: RuntimeAgentRole;
  allowedTools: string[];
  allowedScopes: string[];
  maxConcurrentTasks: number;
  requiresVerification: boolean;
  description: string;
};

const CAPABILITY_PROFILES: Record<RuntimeAgentRole, AgentCapabilityProfile> = {
  planner: {
    role: "planner",
    description:
      "Decomposes user goals into typed subtasks and assigns them to specialized agents.",
    allowedTools: ["memory.read"],
    allowedScopes: ["task:plan"],
    maxConcurrentTasks: 1,
    requiresVerification: false,
  },
  coordinator: {
    role: "coordinator",
    description:
      "Orchestrates multi-agent execution: routes tasks, collects results, and builds the final response.",
    allowedTools: ["memory.read", "memory.write"],
    allowedScopes: ["task:coordinate"],
    maxConcurrentTasks: 5,
    requiresVerification: false,
  },
  researcher: {
    role: "researcher",
    description: "Gathers supporting context from memory, knowledge bases, and external search.",
    allowedTools: ["memory.read", "web.search", "knowledge.search"],
    allowedScopes: ["memory:read", "network:search"],
    maxConcurrentTasks: 3,
    requiresVerification: false,
  },
  coder: {
    role: "coder",
    description: "Implements, refactors, or reviews code based on well-defined task inputs.",
    allowedTools: ["memory.read", "github.repo_import", "filesystem.read"],
    allowedScopes: ["code:write", "integration:github:read"],
    maxConcurrentTasks: 2,
    requiresVerification: true,
  },
  verifier: {
    role: "verifier",
    description:
      "Validates safety and correctness before irreversible actions or privileged tool executions.",
    allowedTools: ["memory.read"],
    allowedScopes: ["task:verify"],
    maxConcurrentTasks: 1,
    requiresVerification: false,
  },
};

export function getCapabilityProfile(role: RuntimeAgentRole): AgentCapabilityProfile {
  return CAPABILITY_PROFILES[role];
}

export function isToolAllowedForRole(toolId: string, role: RuntimeAgentRole): boolean {
  return CAPABILITY_PROFILES[role].allowedTools.includes(toolId);
}
