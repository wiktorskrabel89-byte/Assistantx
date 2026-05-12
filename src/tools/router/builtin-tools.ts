import type { RegisteredTool } from "@/src/tools/router/types";

export const BUILTIN_TOOLS: RegisteredTool[] = [
  {
    id: "memory.read",
    description: "Read memory context through the governed tool router.",
    policy: {
      requiresApproval: false,
      riskLevel: "low",
      scopes: ["memory:read"],
    },
    async execute(input) {
      return {
        source: "memory.read",
        acceptedInputKeys: Object.keys(input),
      };
    },
  },
  {
    id: "github.repo_import",
    description: "Import GitHub repository metadata through the governed tool router.",
    policy: {
      requiresApproval: true,
      riskLevel: "high",
      scopes: ["integration:github:read", "network:external"],
    },
    async execute(input) {
      return {
        source: "github.repo_import",
        status: "delegated",
        input,
      };
    },
  },
];

