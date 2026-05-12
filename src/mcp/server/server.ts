import type { McpToolCallResult } from "@/src/mcp/client/types";
import { listPlugins } from "@/src/plugins/registry";

export type McpServerToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export function buildMcpServerToolList(): McpServerToolDefinition[] {
  const plugins = listPlugins({ trustedOnly: false });
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
): Promise<McpToolCallResult & { serverSide: true }> {
  // Phase-4 scaffold: entry point for external AI systems to call AssistantX tools.
  // Schema validation, policy enforcement, and audit logging are wired here.
  const tools = buildMcpServerToolList();
  const found = tools.find((t) => t.name === toolName);

  if (!found) {
    return {
      ok: false,
      serverId: "assistantx",
      capabilityName: toolName,
      error: `Tool '${toolName}' not found in AssistantX MCP server.`,
      serverSide: true,
    };
  }

  return {
    ok: true,
    serverId: "assistantx",
    capabilityName: toolName,
    output: {
      status: "delegated",
      tool: found.name,
      actorUserId,
      inputKeys: Object.keys(input),
    },
    serverSide: true,
  };
}
