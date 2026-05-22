"use client";

import { useState } from "react";
import { useMCPInstallations } from "@/app/hooks/useMCPInstallations";
import { MCPServerCard } from "./MCPServerCard";
import { MCPServerConfigPanel } from "./MCPServerConfigPanel";
import { Store } from "lucide-react";

// Static server registry — mirrors supabase seed data
export const MCP_SERVER_CATALOG = [
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
    name: "Filesystem",
    description:
      "Secure, read-only access to any project folder on the local disk for code analysis without network exposure.",
    authMethod: "local_path" as const,
    category: "developer" as const,
    capabilities: ["read_file", "list_directory", "directory_tree", "search_files"],
    icon: "📁",
  },
  {
    serverId: "google-calendar",
    pluginId: "mcp-google-calendar",
    name: "Google Calendar",
    description:
      "Analyses your schedule, detects conflicts, plans meetings, and retrieves the agenda on demand via Google Calendar.",
    authMethod: "google_oauth2" as const,
    category: "productivity" as const,
    capabilities: ["list_events", "create_event", "update_event", "delete_event"],
    icon: "📅",
  },
  {
    serverId: "gmail",
    pluginId: "mcp-gmail",
    name: "Gmail",
    description:
      "Searches and analyses email content, extracts key threads, categorises messages, and drafts replies.",
    authMethod: "google_oauth2" as const,
    category: "productivity" as const,
    capabilities: ["list_messages", "get_message", "search_messages", "draft_message"],
    icon: "📧",
  },
  {
    serverId: "google-drive",
    pluginId: "mcp-google-drive",
    name: "Google Drive",
    description:
      "Searches the cloud structure and reads Google Docs, Sheets, and text files to extract knowledge.",
    authMethod: "google_oauth2" as const,
    category: "productivity" as const,
    capabilities: ["search_files", "read_file", "list_files", "export_file"],
    icon: "☁️",
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
    serverId: "memory",
    pluginId: "mcp-memory",
    name: "Memory",
    description:
      "Local knowledge base that lets Jarvis remember context from previous conversations and user preferences.",
    authMethod: "local_file" as const,
    category: "memory" as const,
    capabilities: ["create_entities", "search_nodes", "read_graph", "add_observations"],
    icon: "🧠",
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
  | "memory";

const CATEGORIES: { id: MCPCategory; label: string }[] = [
  { id: "all", label: "All" },
  { id: "developer", label: "Developer" },
  { id: "productivity", label: "Productivity" },
  { id: "database", label: "Database" },
  { id: "web", label: "Web" },
  { id: "communication", label: "Communication" },
  { id: "memory", label: "Memory" },
];

export function MarketplaceClient({ dark }: { dark: boolean }) {
  const [activeCategory, setActiveCategory] = useState<MCPCategory>("all");
  const [configServer, setConfigServer] = useState<MCPServerMeta | null>(null);
  const mcpHook = useMCPInstallations();

  const filtered =
    activeCategory === "all"
      ? MCP_SERVER_CATALOG
      : MCP_SERVER_CATALOG.filter((s) => s.category === activeCategory);

  const shellBg = dark
    ? "bg-slate-900 text-slate-100"
    : "bg-white text-slate-900";

  return (
    <div className={`min-h-screen ${shellBg}`}>
      <div className="mx-auto max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-600 text-white">
            <Store className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">MCP Marketplace</h1>
            <p className={`text-sm ${dark ? "text-slate-400" : "text-slate-500"}`}>
              Connect Jarvis to 10 official MCP servers — GitHub, Google, Slack, and more.
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
              installed={mcpHook.isInstalled(server.serverId)}
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
