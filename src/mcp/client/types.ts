export type McpCapability = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
};

export type McpTrustLevel = "trusted" | "verified" | "sandboxed";

export type McpServerEntry = {
  id: string;
  name: string;
  url: string;
  trustLevel: McpTrustLevel;
  capabilities: McpCapability[];
  credentialRef?: string;
  organizationId?: string | null;
  enabled: boolean;
};

export type McpToolCallRequest = {
  serverId: string;
  capabilityName: string;
  input: Record<string, unknown>;
};

export type McpToolCallResult = {
  ok: boolean;
  serverId: string;
  capabilityName: string;
  output?: Record<string, unknown>;
  error?: string;
};
