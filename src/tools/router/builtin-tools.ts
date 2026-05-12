import type { RegisteredTool } from "@/src/tools/router/types";

export const BUILTIN_TOOLS: RegisteredTool[] = [
  // ───────────────────────────────────────────────────────────────────────────
  // Memory tools
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "memory.read",
    description: "Read memory context for the current user through the governed tool router.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        layer: { type: "string", enum: ["short_term", "episodic", "semantic", "procedural"] },
        limit: { type: "number" },
      },
    },
    policy: {
      requiresApproval: false,
      riskLevel: "low",
      scopes: ["memory:read"],
      executionTier: "trusted",
      timeoutMs: 5_000,
    },
    async execute(input, context) {
      const { memoryService } = await import("@/src/memory/service/memory-service");
      const result = await memoryService.search({
        userId: context.actor.userId ?? "unknown",
        organizationId: context.actor.organizationId,
        query: typeof input.query === "string" ? input.query : undefined,
        layer: input.layer as "short_term" | "episodic" | "semantic" | "procedural" | undefined,
        limit: typeof input.limit === "number" ? input.limit : 10,
      });
      return {
        entries: result.entries.map((e) => ({
          id: e.id,
          layer: e.layer,
          content: e.content,
          score: e.score,
        })),
        totalFound: result.totalFound,
      };
    },
  },

  {
    id: "memory.write",
    description: "Write a memory entry for the current user through the governed tool router.",
    inputSchema: {
      type: "object",
      required: ["content", "layer"],
      properties: {
        content: { type: "string" },
        layer: { type: "string", enum: ["short_term", "episodic", "semantic", "procedural"] },
        tags: { type: "array", items: { type: "string" } },
      },
    },
    policy: {
      requiresApproval: false,
      riskLevel: "low",
      scopes: ["memory:write"],
      executionTier: "trusted",
      timeoutMs: 5_000,
    },
    async execute(input, context) {
      if (typeof input.content !== "string" || !input.content.trim()) {
        throw new Error("memory.write: content is required.");
      }
      const validLayers = ["short_term", "episodic", "semantic", "procedural"] as const;
      type MemoryLayer = typeof validLayers[number];
      const layer: MemoryLayer = validLayers.includes(input.layer as MemoryLayer)
        ? (input.layer as MemoryLayer)
        : "short_term";

      const { memoryService } = await import("@/src/memory/service/memory-service");
      const entry = await memoryService.write({
        layer,
        userId: context.actor.userId ?? "unknown",
        organizationId: context.actor.organizationId,
        content: input.content,
        tags: Array.isArray(input.tags) ? (input.tags as string[]) : [],
      });
      return { id: entry.id, layer: entry.layer, createdAt: entry.createdAt };
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Knowledge retrieval
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "knowledge.search",
    description: "Search the user's uploaded knowledge files using vector similarity.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
        minSimilarity: { type: "number" },
      },
    },
    policy: {
      requiresApproval: false,
      riskLevel: "low",
      scopes: ["memory:read"],
      executionTier: "trusted",
      timeoutMs: 10_000,
    },
    async execute(input, _context) {
      return {
        source: "knowledge.search",
        query: input.query,
        note: "Connect to match_knowledge_chunks DB function in a future wiring step.",
        results: [],
      };
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Web search (stub — wired to an actual search provider in Phase 2)
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "web.search",
    description: "Perform a web search and return summarized results.",
    inputSchema: {
      type: "object",
      required: ["query"],
      properties: {
        query: { type: "string" },
        maxResults: { type: "number" },
      },
    },
    policy: {
      requiresApproval: false,
      riskLevel: "medium",
      scopes: ["network:search"],
      executionTier: "trusted",
      timeoutMs: 15_000,
    },
    async execute(input, _context) {
      return {
        source: "web.search",
        query: input.query,
        note: "Wire to a search provider (Brave, Serper, Tavily) in Phase 2.",
        results: [],
      };
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // GitHub integration
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "github.repo_import",
    description: "Import GitHub repository metadata through the governed tool router.",
    inputSchema: {
      type: "object",
      required: ["repo"],
      properties: {
        repo: { type: "string" },
        ref: { type: "string" },
      },
    },
    policy: {
      requiresApproval: false,
      riskLevel: "medium",
      scopes: ["integration:github:read", "network:external"],
      executionTier: "trusted",
      timeoutMs: 30_000,
    },
    async execute(input, _context) {
      return {
        source: "github.repo_import",
        status: "delegated",
        repo: input.repo,
        ref: input.ref ?? "main",
      };
    },
  },

  {
    id: "github.repo_write",
    description: "Push changes to a GitHub repository (requires approval).",
    inputSchema: {
      type: "object",
      required: ["repo", "branch", "message"],
      properties: {
        repo: { type: "string" },
        branch: { type: "string" },
        message: { type: "string" },
      },
    },
    policy: {
      requiresApproval: true,
      riskLevel: "high",
      irreversible: true,
      scopes: ["integration:github:write", "network:external"],
      executionTier: "trusted",
      timeoutMs: 60_000,
    },
    async execute(input, _context) {
      return {
        source: "github.repo_write",
        status: "pending_approval",
        repo: input.repo,
        branch: input.branch,
      };
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // Deployment
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "deployment.preview",
    description: "Create a preview deployment of a static site.",
    inputSchema: {
      type: "object",
      required: ["html"],
      properties: {
        html: { type: "string" },
        css: { type: "string" },
        js: { type: "string" },
        projectName: { type: "string" },
      },
    },
    policy: {
      requiresApproval: false,
      riskLevel: "medium",
      scopes: ["deployment:preview"],
      executionTier: "trusted",
      timeoutMs: 60_000,
    },
    async execute(input, _context) {
      return {
        source: "deployment.preview",
        status: "delegated",
        projectName: input.projectName ?? "preview",
      };
    },
  },

  {
    id: "deployment.production",
    description: "Deploy to production (requires approval and is irreversible).",
    inputSchema: {
      type: "object",
      required: ["projectId"],
      properties: {
        projectId: { type: "string" },
        environment: { type: "string", enum: ["staging", "production"] },
      },
    },
    policy: {
      requiresApproval: true,
      riskLevel: "critical",
      irreversible: true,
      scopes: ["deployment:production"],
      executionTier: "sandboxed",
      timeoutMs: 120_000,
    },
    async execute(input, _context) {
      return {
        source: "deployment.production",
        status: "pending_approval",
        projectId: input.projectId,
        environment: input.environment ?? "staging",
      };
    },
  },

  // ───────────────────────────────────────────────────────────────────────────
  // MCP passthrough
  // ───────────────────────────────────────────────────────────────────────────
  {
    id: "mcp.call",
    description: "Invoke a tool on a registered MCP server through the governed router.",
    inputSchema: {
      type: "object",
      required: ["serverId", "capabilityName"],
      properties: {
        serverId: { type: "string" },
        capabilityName: { type: "string" },
        input: { type: "object" },
      },
    },
    policy: {
      requiresApproval: false,
      riskLevel: "medium",
      scopes: ["mcp:call"],
      executionTier: "sandboxed",
      timeoutMs: 30_000,
    },
    async execute(input, context) {
      const { callMcpTool } = await import("@/src/mcp/client/client");
      const result = await callMcpTool(
        {
          serverId: String(input.serverId ?? ""),
          capabilityName: String(input.capabilityName ?? ""),
          input: (input.input as Record<string, unknown>) ?? {},
        },
        context.executionId,
        context.actor.userId,
      );
      return {
        ok: result.ok,
        serverId: result.serverId,
        capabilityName: result.capabilityName,
        output: result.output ?? null,
        error: result.error ?? null,
      };
    },
  },
];

