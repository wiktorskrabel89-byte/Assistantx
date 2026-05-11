import type { McpServerEntry } from "@/src/mcp/client/types";

const registry = new Map<string, McpServerEntry>();

export function registerMcpServer(entry: McpServerEntry): void {
  registry.set(entry.id, entry);
}

export function getMcpServer(id: string): McpServerEntry | undefined {
  return registry.get(id);
}

export function listMcpServers(organizationId?: string | null): McpServerEntry[] {
  return [...registry.values()].filter((s) => {
    if (!s.enabled) return false;
    if (organizationId === undefined) return true;
    return s.organizationId === organizationId || s.organizationId === null;
  });
}

export function deregisterMcpServer(id: string): boolean {
  return registry.delete(id);
}
