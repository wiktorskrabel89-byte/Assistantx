import type { McpToolCallResult } from "@/src/mcp/client/types";
import { listPlugins } from "@/src/plugins/registry";
import { toolRegistry } from "@/src/tools/router/registry";
import { ToolRouter } from "@/src/tools/router/router";
import { randomUUID } from "node:crypto";

export type McpServerToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export async function buildMcpServerToolList(): Promise<McpServerToolDefinition[]> {
  const plugins = await listPlugins({ trustedOnly: false });
  return plugins.flatMap((p) =>
    p.capabilities.map((cap) => ({
      name: `${p.id}/${cap.name}`,
      description: cap.description,
      // Input schema is populated from capability declarations at plugin registration time.
      // Until schema-level capability declarations are added, external consumers should
      // treat all inputs as `{ type: "object" }` and validate via the tool router.
      inputSchema: { type: "object", properties: {} },
    })),
  );
}

export async function handleMcpServerRequest(
  toolName: string,
  input: Record<string, unknown>,
  actorUserId: string | null,
  actorOrganizationId: string | null = null,
): Promise<McpToolCallResult & { serverSide: true }> {
  const tools = await buildMcpServerToolList();
  const found = tools.find((t) => t.name === toolName);
  const internalToolId = toolRegistry.has(toolName)
    ? toolName
    : toolName.replace("/", ".");

  if (!found || !toolRegistry.has(internalToolId)) {
    return {
      ok: false,
      serverId: "assistantx",
      capabilityName: toolName,
      error: `Tool '${toolName}' not found in AssistantX MCP server.`,
      serverSide: true,
    };
  }

  // Route through the governed ToolRouter pipeline so policy, rate-limit,
  // approval and audit steps all apply to inbound MCP server calls.
  const toolRouter = new ToolRouter();
  const executionId = randomUUID();
  const result = await toolRouter.execute(
    {
      toolId: internalToolId,
      input: {
        ...input,
        _requestedByUserId: actorUserId,
        _requestedByOrganizationId: actorOrganizationId,
      },
    },
    {
      executionId,
      workflowId: "mcp/server",
      actor: { userId: actorUserId, organizationId: actorOrganizationId, sessionId: null },
    },
  );

  if (!result.ok) {
    return {
      ok: false,
      serverId: "assistantx",
      capabilityName: toolName,
      error: result.error ?? "Tool execution failed.",
      serverSide: true,
    };
  }

  return {
    ok: true,
    serverId: "assistantx",
    capabilityName: toolName,
    output: result.output,
    serverSide: true,
  };
}
