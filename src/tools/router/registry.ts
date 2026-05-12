/**
 * Unified Tool Registry — Phase 1 Foundation Hardening
 *
 * Single source of truth for all tool registrations: built-in tools, plugins,
 * and MCP tools.  The Tool Router discovers tools exclusively through this
 * registry; nothing is registered anywhere else.
 *
 * Built-in tools are loaded eagerly at module import.
 * Plugin and MCP tools are registered dynamically at runtime.
 */

import type { RegisteredTool } from "@/src/tools/router/types";
import { BUILTIN_TOOLS } from "@/src/tools/router/builtin-tools";

type ToolSource = "builtin" | "plugin" | "mcp";

type RegistryEntry = {
  tool: RegisteredTool;
  source: ToolSource;
  pluginId?: string;
  mcpServerId?: string;
  registeredAt: string;
};

class ToolRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  constructor() {
    for (const tool of BUILTIN_TOOLS) {
      this.entries.set(tool.id, {
        tool,
        source: "builtin",
        registeredAt: new Date().toISOString(),
      });
    }
  }

  /**
   * Register or replace a tool.  Plugin and MCP registrations are namespaced
   * to prevent collision with built-in tool IDs.
   */
  register(
    tool: RegisteredTool,
    source: ToolSource,
    meta?: { pluginId?: string; mcpServerId?: string },
  ): void {
    if (source !== "builtin" && !tool.id.includes(".")) {
      throw new Error(
        `Plugin/MCP tool IDs must be namespaced (e.g. "myplugin.toolName"). Got: "${tool.id}"`,
      );
    }
    this.entries.set(tool.id, {
      tool,
      source,
      pluginId: meta?.pluginId,
      mcpServerId: meta?.mcpServerId,
      registeredAt: new Date().toISOString(),
    });
  }

  deregister(toolId: string): boolean {
    return this.entries.delete(toolId);
  }

  get(toolId: string): RegisteredTool | undefined {
    return this.entries.get(toolId)?.tool;
  }

  getEntry(toolId: string): RegistryEntry | undefined {
    return this.entries.get(toolId);
  }

  list(filter?: {
    source?: ToolSource;
    pluginId?: string;
    mcpServerId?: string;
  }): RegisteredTool[] {
    return [...this.entries.values()]
      .filter((e) => {
        if (filter?.source && e.source !== filter.source) return false;
        if (filter?.pluginId && e.pluginId !== filter.pluginId) return false;
        if (filter?.mcpServerId && e.mcpServerId !== filter.mcpServerId) return false;
        return true;
      })
      .map((e) => e.tool);
  }

  has(toolId: string): boolean {
    return this.entries.has(toolId);
  }

  size(): number {
    return this.entries.size;
  }
}

/** Singleton registry shared across the process lifetime. */
export const toolRegistry = new ToolRegistry();
