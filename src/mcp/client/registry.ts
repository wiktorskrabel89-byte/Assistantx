import type { McpServerEntry } from "@/src/mcp/client/types";
import { RUFLO_INSTALLABLE_PROFILE } from "@/src/ecosystem/ruflo";

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

function fromInstallableProfile(id: string): McpServerEntry | undefined {
  if (id !== RUFLO_INSTALLABLE_PROFILE.serverId) return undefined;
  return {
    id: RUFLO_INSTALLABLE_PROFILE.serverId,
    name: RUFLO_INSTALLABLE_PROFILE.name,
    url: "local://ruflo-mcp",
    trustLevel: "verified",
    enabled: false,
    organizationId: null,
    credentialRef: undefined,
    capabilities: RUFLO_INSTALLABLE_PROFILE.capabilities.map((capability) => ({
      name: capability.name,
      description: capability.description,
      inputSchema: { type: "object", properties: {} },
      outputSchema: { type: "object", properties: {} },
      riskLevel: capability.riskLevel,
      requiresApproval: capability.requiresApproval,
      requiresActorAttribution: capability.requiresActorAttribution,
    })),
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
    if (!row) {
      const installable = fromInstallableProfile(id);
      if (installable) return installable;
      return undefined;
    }
    const mapped = fromDbRow(row);
    registry.set(id, mapped);
    return mapped;
  } catch {
    return fromInstallableProfile(id);
  }
}

export async function listMcpServers(organizationId?: string | null): Promise<McpServerEntry[]> {
  try {
    const { listMcpServerRegistrations } = await import("@/src/core/persistence/runtime-db");
    const rows = await listMcpServerRegistrations(organizationId);
    const mapped = rows.map(fromDbRow);
    for (const entry of mapped) registry.set(entry.id, entry);
    const filtered = mapped.filter((s) => {
      if (!s.enabled) return false;
      if (organizationId === undefined) return true;
      return s.organizationId === organizationId || s.organizationId === null;
    });
    if (!filtered.some((entry) => entry.id === RUFLO_INSTALLABLE_PROFILE.serverId)) {
      filtered.push(fromInstallableProfile(RUFLO_INSTALLABLE_PROFILE.serverId) as McpServerEntry);
    }
    return filtered;
  } catch {
    // Fall back to in-memory registry if DB is unavailable.
  }

  const fallback = [...registry.values()].filter((s) => {
    if (!s.enabled) return false;
    if (organizationId === undefined) return true;
    return s.organizationId === organizationId || s.organizationId === null;
  });
  if (!fallback.some((entry) => entry.id === RUFLO_INSTALLABLE_PROFILE.serverId)) {
    fallback.push(fromInstallableProfile(RUFLO_INSTALLABLE_PROFILE.serverId) as McpServerEntry);
  }
  return fallback;
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

export function listInstallableMcpProfiles() {
  return [RUFLO_INSTALLABLE_PROFILE] as const;
}
