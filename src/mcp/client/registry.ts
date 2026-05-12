import type { McpServerEntry } from "@/src/mcp/client/types";

const registry = new Map<string, McpServerEntry>();

function toDbRow(entry: McpServerEntry) {
  return {
    id: entry.id,
    name: entry.name,
    url: entry.url,
    trust_level: entry.trustLevel,
    capabilities: entry.capabilities,
    credential_ref: entry.credentialRef ?? null,
    organization_id: entry.organizationId ?? null,
    enabled: entry.enabled,
  } as const;
}

function fromDbRow(row: {
  id: string;
  name: string;
  url: string;
  trust_level: "trusted" | "verified" | "sandboxed";
  capabilities: Array<Record<string, unknown>>;
  credential_ref?: string | null;
  organization_id?: string | null;
  enabled: boolean;
}): McpServerEntry {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    trustLevel: row.trust_level,
    capabilities: row.capabilities as McpServerEntry["capabilities"],
    credentialRef: row.credential_ref ?? undefined,
    organizationId: row.organization_id ?? null,
    enabled: row.enabled,
  };
}

export async function registerMcpServer(entry: McpServerEntry): Promise<void> {
  registry.set(entry.id, entry);
  try {
    const { upsertMcpServerRegistration } = await import("@/src/core/persistence/runtime-db");
    await upsertMcpServerRegistration(toDbRow(entry));
  } catch {
    // Keep in-memory fallback available if DB persistence fails.
  }
}

export async function getMcpServer(id: string): Promise<McpServerEntry | undefined> {
  const cached = registry.get(id);
  if (cached) return cached;

  try {
    const { getMcpServerRegistration } = await import("@/src/core/persistence/runtime-db");
    const row = await getMcpServerRegistration(id);
    if (!row) return undefined;
    const mapped = fromDbRow(row);
    registry.set(id, mapped);
    return mapped;
  } catch {
    return undefined;
  }
}

export async function listMcpServers(organizationId?: string | null): Promise<McpServerEntry[]> {
  try {
    const { listMcpServerRegistrations } = await import("@/src/core/persistence/runtime-db");
    const rows = await listMcpServerRegistrations(organizationId);
    const mapped = rows.map(fromDbRow);
    for (const entry of mapped) registry.set(entry.id, entry);
    return mapped.filter((s) => {
      if (!s.enabled) return false;
      if (organizationId === undefined) return true;
      return s.organizationId === organizationId || s.organizationId === null;
    });
  } catch {
    // Fall back to in-memory registry if DB is unavailable.
  }

  return [...registry.values()].filter((s) => {
    if (!s.enabled) return false;
    if (organizationId === undefined) return true;
    return s.organizationId === organizationId || s.organizationId === null;
  });
}

export async function deregisterMcpServer(id: string): Promise<boolean> {
  const removed = registry.delete(id);
  try {
    const { setMcpServerEnabled } = await import("@/src/core/persistence/runtime-db");
    await setMcpServerEnabled(id, false);
    return true;
  } catch {
    return removed;
  }
}
