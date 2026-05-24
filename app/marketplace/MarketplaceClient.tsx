"use client";

import { useState } from "react";
import { useMCPInstallations } from "@/app/hooks/useMCPInstallations";
import { MCPServerCard } from "./MCPServerCard";
import { MCPServerConfigPanel } from "./MCPServerConfigPanel";
import { Store } from "lucide-react";

// Static server registry — mirrors supabase seed data
export const MCP_SERVER_CATALOG = [
  {
    serverId: "ruflo",
    pluginId: "mcp-ruflo",
    name: "Ruflo Swarm",
    description:
      "External multi-agent orchestrator adapter (Queen/Worker) with governed MCP invocation and persistent shared memory namespace.",
    authMethod: "none" as const,
    category: "developer" as const,
    capabilities: ["swarm_init", "agent_spawn", "memory_store", "train_pipeline", "health"],
    icon: "👑",
  },
  {
    serverId: "github",
    pluginId: "mcp-github",
    name: "GitHub",
    description:
      "Reads source code, analyses commit history, and manages Issues and Pull Requests directly on GitHub. Ideal for giga-repository analysis.",
    authMethod: "pat" as const,
    category: "developer" as const,
    capabilities: ["search_repositories", "get_file_contents", "list_commits", "list_issues", "list_pull_requests"],
    icon: "🐙",
  },
  {
    serverId: "filesystem",
    pluginId: "mcp-filesystem",
    name: "Local Workspace",
    description:
      "Ideal for Giga-Repository local RAG analysis — reads any project folder without leaving your machine.",
    authMethod: "local_path" as const,
    category: "developer" as const,
    capabilities: ["read_file", "list_directory", "directory_tree", "search_files"],
    icon: "📁",
    builtIn: true,
  },
  {
    serverId: "google-suite",
    pluginId: "mcp-google-suite",
    name: "Google Suite",
    description:
      "One-click Google integration for Calendar, Gmail, and Drive with a shared OAuth session and unified productivity context.",
    authMethod: "google_oauth2" as const,
    category: "productivity" as const,
    capabilities: ["list_events", "search_messages", "read_drive_files", "create_event", "list_files", "draft_message"],
    icon: "🔷",
  },
  {
    serverId: "operating-system",
    pluginId: "mcp-operating-system",
    name: "Operating System",
    description:
      "Local system control for app launching, hardware telemetry, screenshots, and guarded command execution.",
    authMethod: "none" as const,
    category: "system" as const,
    capabilities: ["launch_app", "get_system_stats", "take_screenshot", "execute_command"],
    icon: "🖥️",
  },
  {
    serverId: "slack",
    pluginId: "mcp-slack",
    name: "Slack",
    description:
      "Analyses channel history, summarises team discussions, and can post messages on your behalf.",
    authMethod: "slack_oauth" as const,
    category: "communication" as const,
    capabilities: ["list_channels", "get_channel_history", "post_message", "list_users"],
    icon: "💬",
  },
  {
    serverId: "fetch",
    pluginId: "mcp-fetch",
    name: "Web Fetch",
    description:
      "Fetches clean text from any URL so Jarvis can analyse articles, documentation, and web pages.",
    authMethod: "none" as const,
    category: "web" as const,
    capabilities: ["fetch", "fetch_markdown", "fetch_html"],
    icon: "🌐",
    builtIn: true,
  },
  {
    serverId: "brave-search",
    pluginId: "mcp-brave-search",
    name: "Brave Search",
    description:
      "Gives Jarvis direct access to live web search results to supplement its knowledge with the latest information.",
    authMethod: "api_key" as const,
    category: "web" as const,
    capabilities: ["brave_web_search", "brave_news_search", "brave_image_search"],
    icon: "🔍",
  },
  {
    serverId: "memory",
    pluginId: "mcp-memory",
    name: "Memory",
    description:
      "Local knowledge base that lets Jarvis remember context from previous conversations and user preferences.",
    authMethod: "local_file" as const,
    category: "memory" as const,
    capabilities: ["create_entities", "search_nodes", "read_graph", "add_observations"],
    icon: "🧠",
    builtIn: true,
  },
  {
    serverId: "postgres",
    pluginId: "mcp-postgres",
    name: "PostgreSQL",
    description:
      "Analyses table structures and allows natural-language questions against local or cloud SQL databases.",
    authMethod: "uri" as const,
    category: "database" as const,
    capabilities: ["query", "list_tables", "describe_table"],
    icon: "🐘",
  },
] as const;

export type MCPServerMeta = (typeof MCP_SERVER_CATALOG)[number];

export type MCPCategory =
  | "all"
  | "developer"
  | "productivity"
  | "database"
  | "web"
  | "communication"
  | "memory"
  | "system";

const CATEGORIES: { id: MCPCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "developer", label: "Developer" },
  { id: "productivity", label: "Productivity" },
  { id: "database", label: "Database" },
  { id: "web", label: "Web" },
  { id: "communication", label: "Communication" },
  { id: "memory", label: "Memory" },
  { id: "system", label: "System" },
];

export function MarketplaceClient({ dark }: { dark: boolean }) {
  const [activeCategory, setActiveCategory] = useState<MCPCategory>("all");
  const [configServer, setConfigServer] = useState<MCPServerMeta | null>(null);
  const mcpHook = useMCPInstallations();

  const filtered =
    activeCategory === "all"
      ? MCP_SERVER_CATALOG.filter((s) => s.serverId !== "postgres")
      : MCP_SERVER_CATALOG.filter((s) => s.category === activeCategory);

  const shellBg = dark
    ? "bg-slate-900 text-slate-100"
    : "bg-white text-slate-900";

  return (
    <div className={`h-full overflow-y-auto ${shellBg}`}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">MCP Marketplace</h1>
            <p className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
              7 MCP servers plus 3 always-on built-in tools for local workspace, web fetch, and memory.
            </p>
          </div>
          {mcpHook.installedCount > 0 && (
            <div className="ml-auto rounded-full bg-violet-100 px-3 py-1 text-sm font-medium text-violet-800 dark:bg-violet-900/40 dark:text-violet-200">
              🔌 {mcpHook.installedCount} installed
            </div>
          )}
        </div>

        {/* Category filter */}
        <div className="mb-6 flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => setActiveCategory(cat.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat.id
                  ? "bg-violet-600 text-white"
                  : dark
                  ? "bg-slate-800 text-slate-300 hover:bg-slate-700"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Cards grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((server) => (
            <MCPServerCard
              key={server.serverId}
              server={server}
              dark={dark}
              installed={Boolean((server as { builtIn?: boolean }).builtIn) || mcpHook.isInstalled(server.serverId)}
              builtIn={Boolean((server as { builtIn?: boolean }).builtIn)}
              onInstall={() => mcpHook.install(server.serverId)}
              onUninstall={() => mcpHook.uninstall(server.serverId)}
              onConfigure={() => setConfigServer(server)}
              loading={mcpHook.isInstalling || mcpHook.isUninstalling}
            />
          ))}
        </div>
      </div>

      {/* Config panel slide-over */}
      {configServer && (
        <MCPServerConfigPanel
          server={configServer}
          dark={dark}
          onClose={() => setConfigServer(null)}
        />
      )}
    </div>
  );
}
