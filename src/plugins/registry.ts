import type { PluginManifest } from "@/src/plugins/manifest";

const registry = new Map<string, PluginManifest>();

function toDbRow(manifest: PluginManifest) {
  return {
    plugin_id: manifest.id,
    name: manifest.name,
    version: manifest.version,
    description: manifest.description,
    author: manifest.author,
    homepage: manifest.homepage ?? null,
    capabilities: manifest.capabilities as unknown as Record<string, unknown>[],
    required_scopes: manifest.requiredScopes,
    sandboxed: manifest.sandboxed,
    trusted_publisher: manifest.trustedPublisher,
    status: "approved" as const,
    organization_id: null,
  };
}

function fromDbRow(row: {
  plugin_id: string;
  name: string;
  version: string;
  description?: string | null;
  author?: string | null;
  homepage?: string | null;
  capabilities: unknown[];
  required_scopes: string[];
  sandboxed: boolean;
  trusted_publisher: boolean;
}): PluginManifest {
  return {
    id: row.plugin_id,
    name: row.name,
    version: row.version,
    description: row.description ?? "",
    author: row.author ?? "",
    homepage: row.homepage ?? undefined,
    capabilities: row.capabilities as PluginManifest["capabilities"],
    requiredScopes: row.required_scopes as PluginManifest["requiredScopes"],
    sandboxed: row.sandboxed,
    trustedPublisher: row.trusted_publisher,
  };
}

export async function registerPlugin(manifest: PluginManifest): Promise<void> {
  registry.set(manifest.id, manifest);
  try {
    const { upsertPluginManifest } = await import(
      "@/src/core/persistence/runtime-db"
    );
    await upsertPluginManifest(toDbRow(manifest));
  } catch {
    // Keep in-memory fallback available if DB persistence fails.
  }
}

export async function getPlugin(id: string): Promise<PluginManifest | undefined> {
  const cached = registry.get(id);
  if (cached) return cached;

  try {
    const { getPluginManifest } = await import("@/src/core/persistence/runtime-db");
    const row = await getPluginManifest(id);
    if (!row) return undefined;
    const mapped = fromDbRow(row);
    registry.set(id, mapped);
    return mapped;
  } catch {
    return undefined;
  }
}

export async function listPlugins(options?: {
  trustedOnly?: boolean;
  sandboxedOnly?: boolean;
}): Promise<PluginManifest[]> {
  try {
    const { listPluginManifests } = await import("@/src/core/persistence/runtime-db");
    const rows = await listPluginManifests({
      trustedOnly: options?.trustedOnly,
      status: "approved",
    });
    const mapped = rows.map(fromDbRow);
    for (const m of mapped) registry.set(m.id, m);
    return mapped.filter((p) => {
      if (options?.sandboxedOnly && !p.sandboxed) return false;
      return true;
    });
  } catch {
    // Fall back to in-memory if DB is unavailable.
  }

  return [...registry.values()].filter((p) => {
    if (options?.trustedOnly && !p.trustedPublisher) return false;
    if (options?.sandboxedOnly && !p.sandboxed) return false;
    return true;
  });
}

export async function deregisterPlugin(id: string): Promise<boolean> {
  const removed = registry.delete(id);
  try {
    const { updatePluginManifestStatus } = await import(
      "@/src/core/persistence/runtime-db"
    );
    await updatePluginManifestStatus(id, "deprecated");
    return true;
  } catch {
    return removed;
  }
}
