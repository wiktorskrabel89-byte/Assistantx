import { getMcpServer } from "@/src/mcp/client/registry";
import type { McpToolCallRequest, McpToolCallResult } from "@/src/mcp/client/types";
import { createEventBus } from "@/src/core/events/event-bus";
import { RUNTIME_EVENT_TYPES } from "@/src/core/events/types";

const eventBus = createEventBus();

export async function callMcpTool(
  request: McpToolCallRequest,
  executionId: string,
  actorUserId: string | null,
): Promise<McpToolCallResult> {
  const server = await getMcpServer(request.serverId);
  if (!server) {
    return {
      ok: false,
      serverId: request.serverId,
      capabilityName: request.capabilityName,
      error: `MCP server '${request.serverId}' not found in registry.`,
    };
  }
  if (!server.enabled) {
    return {
      ok: false,
      serverId: request.serverId,
      capabilityName: request.capabilityName,
      error: `MCP server '${request.serverId}' is disabled.`,
    };
  }

  const capability = server.capabilities.find((c) => c.name === request.capabilityName);
  if (!capability) {
    return {
      ok: false,
      serverId: request.serverId,
      capabilityName: request.capabilityName,
      error: `Capability '${request.capabilityName}' not found on server '${request.serverId}'.`,
    };
  }

  // Schema validation and actual HTTP call to the MCP server would live here.
  // Phase-3 scaffold: emit event and return placeholder output.
  await eventBus.publish({
    type: RUNTIME_EVENT_TYPES.MCP_TOOL_CALLED,
    timestamp: new Date().toISOString(),
    actorUserId,
    executionId,
    payload: {
      serverId: request.serverId,
      capabilityName: request.capabilityName,
      trustLevel: server.trustLevel,
    },
  });

  return {
    ok: true,
    serverId: request.serverId,
    capabilityName: request.capabilityName,
    output: {
      status: "dispatched",
      server: server.name,
      capability: capability.name,
    },
  };
}
