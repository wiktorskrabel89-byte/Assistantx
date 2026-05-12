import type { PluginManifest } from "@/src/plugins/manifest";

const registry = new Map<string, PluginManifest>();

export function registerPlugin(manifest: PluginManifest): void {
  registry.set(manifest.id, manifest);
}

export function getPlugin(id: string): PluginManifest | undefined {
  return registry.get(id);
}

export function listPlugins(options?: {
  trustedOnly?: boolean;
  sandboxedOnly?: boolean;
}): PluginManifest[] {
  return [...registry.values()].filter((p) => {
    if (options?.trustedOnly && !p.trustedPublisher) return false;
    if (options?.sandboxedOnly && !p.sandboxed) return false;
    return true;
  });
}

export function deregisterPlugin(id: string): boolean {
  return registry.delete(id);
}
