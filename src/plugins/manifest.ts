export type PluginPermissionScope =
  | "memory:read"
  | "memory:write"
  | "tool:execute:low"
  | "tool:execute:medium"
  | "workflow:create"
  | "workflow:read"
  | "integration:github:read"
  | "integration:google:read";

export type PluginCapabilityDeclaration = {
  name: string;
  description: string;
  scopes: PluginPermissionScope[];
};

export type PluginManifest = {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  homepage?: string;
  capabilities: PluginCapabilityDeclaration[];
  requiredScopes: PluginPermissionScope[];
  sandboxed: boolean;
  trustedPublisher: boolean;
};
