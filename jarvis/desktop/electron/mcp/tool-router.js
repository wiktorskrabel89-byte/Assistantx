'use strict';

/**
 * Maps natural-language LLM tool call names → { serverId, method } pairs.
 *
 * When the LLM invokes a tool (e.g. gmail_search), this router looks up which
 * MCP server handles it and delegates via createMCPServerManager.callTool().
 */

const TOOL_MAP = {
  // ── GitHub ────────────────────────────────────────────────────────────────
  github_search_repositories:  { serverId: 'github', method: 'search_repositories' },
  github_get_file_contents:    { serverId: 'github', method: 'get_file_contents' },
  github_list_commits:         { serverId: 'github', method: 'list_commits' },
  github_get_commit:           { serverId: 'github', method: 'get_commit' },
  github_list_issues:          { serverId: 'github', method: 'list_issues' },
  github_get_issue:            { serverId: 'github', method: 'get_issue' },
  github_list_pull_requests:   { serverId: 'github', method: 'list_pull_requests' },
  github_get_pull_request:     { serverId: 'github', method: 'get_pull_request' },
  github_create_issue:         { serverId: 'github', method: 'create_issue' },
  github_create_pull_request:  { serverId: 'github', method: 'create_pull_request' },

  // ── Filesystem ────────────────────────────────────────────────────────────
  fs_read_file:           { serverId: 'filesystem', method: 'read_file', dispatch: 'native' },
  fs_read_multiple_files: { serverId: 'filesystem', method: 'read_multiple_files', dispatch: 'native' },
  fs_list_directory:      { serverId: 'filesystem', method: 'list_directory', dispatch: 'native' },
  fs_directory_tree:      { serverId: 'filesystem', method: 'directory_tree', dispatch: 'native' },
  fs_search_files:        { serverId: 'filesystem', method: 'search_files', dispatch: 'native' },
  fs_get_file_info:       { serverId: 'filesystem', method: 'get_file_info', dispatch: 'native' },

  // ── Google Calendar ───────────────────────────────────────────────────────
  calendar_list_events:   { serverId: 'google-suite', method: 'list_events' },
  calendar_create_event:  { serverId: 'google-suite', method: 'create_event' },
  calendar_update_event:  { serverId: 'google-suite', method: 'update_event' },
  calendar_delete_event:  { serverId: 'google-suite', method: 'delete_event' },
  calendar_get_calendar:  { serverId: 'google-suite', method: 'get_calendar' },
  calendar_list_calendars:{ serverId: 'google-suite', method: 'list_calendars' },

  // ── Gmail ─────────────────────────────────────────────────────────────────
  gmail_list_messages:  { serverId: 'google-suite', method: 'list_messages' },
  gmail_get_message:    { serverId: 'google-suite', method: 'get_message' },
  gmail_search:         { serverId: 'google-suite', method: 'search_messages' },
  gmail_send_message:   { serverId: 'google-suite', method: 'send_message' },
  gmail_draft_message:  { serverId: 'google-suite', method: 'draft_message' },
  gmail_list_labels:    { serverId: 'google-suite', method: 'list_labels' },

  // ── Google Drive ──────────────────────────────────────────────────────────
  drive_search_files:   { serverId: 'google-suite', method: 'search_files' },
  drive_read_file:      { serverId: 'google-suite', method: 'read_file' },
  drive_list_files:     { serverId: 'google-suite', method: 'list_files' },
  drive_export_file:    { serverId: 'google-suite', method: 'export_file' },
  drive_get_metadata:   { serverId: 'google-suite', method: 'get_file_metadata' },

  // ── PostgreSQL ────────────────────────────────────────────────────────────
  db_query:          { serverId: 'postgres', method: 'query' },
  db_list_tables:    { serverId: 'postgres', method: 'list_tables' },
  db_describe_table: { serverId: 'postgres', method: 'describe_table' },
  db_list_schemas:   { serverId: 'postgres', method: 'list_schemas' },

  // ── Web Fetch ─────────────────────────────────────────────────────────────
  web_fetch:          { serverId: 'fetch', method: 'fetch', dispatch: 'native' },
  web_fetch_markdown: { serverId: 'fetch', method: 'fetch_markdown', dispatch: 'native' },
  web_fetch_html:     { serverId: 'fetch', method: 'fetch_html', dispatch: 'native' },
  web_fetch_raw:      { serverId: 'fetch', method: 'fetch_raw', dispatch: 'native' },

  // ── Brave Search ──────────────────────────────────────────────────────────
  brave_web_search:   { serverId: 'brave-search', method: 'brave_web_search' },
  brave_local_search: { serverId: 'brave-search', method: 'brave_local_search' },
  brave_news_search:  { serverId: 'brave-search', method: 'brave_news_search' },
  brave_image_search: { serverId: 'brave-search', method: 'brave_image_search' },

  // ── Slack ─────────────────────────────────────────────────────────────────
  slack_list_channels:    { serverId: 'slack', method: 'list_channels' },
  slack_get_history:      { serverId: 'slack', method: 'get_channel_history' },
  slack_get_thread:       { serverId: 'slack', method: 'get_thread_replies' },
  slack_post_message:     { serverId: 'slack', method: 'post_message' },
  slack_list_users:       { serverId: 'slack', method: 'list_users' },
  slack_get_user_profile: { serverId: 'slack', method: 'get_user_profile' },

  // ── Memory ────────────────────────────────────────────────────────────────
  memory_create_entities:   { serverId: 'memory', method: 'create_entities', dispatch: 'native' },
  memory_create_relations:  { serverId: 'memory', method: 'create_relations', dispatch: 'native' },
  memory_add_observations:  { serverId: 'memory', method: 'add_observations', dispatch: 'native' },
  memory_delete_entities:   { serverId: 'memory', method: 'delete_entities', dispatch: 'native' },
  memory_delete_observations:{ serverId: 'memory', method: 'delete_observations', dispatch: 'native' },
  memory_delete_relations:  { serverId: 'memory', method: 'delete_relations', dispatch: 'native' },
  memory_read_graph:        { serverId: 'memory', method: 'read_graph', dispatch: 'native' },
  memory_search:            { serverId: 'memory', method: 'search_nodes', dispatch: 'native' },
  memory_open_nodes:        { serverId: 'memory', method: 'open_nodes', dispatch: 'native' },

  // ── Operating System ────────────────────────────────────────────────────────
  os_launch_app:        { serverId: 'operating-system', method: 'launch_app', dispatch: 'native' },
  os_get_system_stats:  { serverId: 'operating-system', method: 'get_system_stats', dispatch: 'native' },
  os_take_screenshot:   { serverId: 'operating-system', method: 'take_screenshot', dispatch: 'native' },
  os_execute_command:   { serverId: 'operating-system', method: 'execute_command', dispatch: 'native' },
};
const ALWAYS_ON_NATIVE_SERVERS = new Set(['filesystem', 'fetch', 'memory']);

function createMCPToolRouter({ serverManager, nativeTools = {} }) {
  /**
   * Route a tool call by name.
   * @param {string} toolName  - One of the keys in TOOL_MAP
   * @param {object} params
   * @returns {Promise<{ ok: boolean, result?: any, error?: string }>}
   */
  async function route(toolName, params = {}) {
    const mapping = TOOL_MAP[toolName];
    if (!mapping) {
      return { ok: false, error: `unknown-mcp-tool:${toolName}` };
    }
    try {
      if (mapping.dispatch === 'native') {
        if (!ALWAYS_ON_NATIVE_SERVERS.has(mapping.serverId) && serverManager) {
          const installed = serverManager.listServers().some((server) => server.id === mapping.serverId && server.installed);
          if (!installed) {
            return { ok: false, error: `mcp-server-not-installed:${mapping.serverId}` };
          }
        }
        const group = nativeTools[mapping.serverId];
        const handler = group?.[mapping.method];
        if (typeof handler !== 'function') {
          return { ok: false, error: `native-mcp-tool-missing:${mapping.serverId}:${mapping.method}` };
        }
        const result = await handler(params);
        return { ok: true, result };
      }
      const result = await serverManager.callTool(mapping.serverId, mapping.method, params);
      return { ok: true, result };
    } catch (err) {
      return { ok: false, error: String(err?.message || err || 'mcp-call-failed') };
    }
  }

  function listTools() {
    return Object.keys(TOOL_MAP).map((name) => ({
      name,
      serverId: TOOL_MAP[name].serverId,
      method: TOOL_MAP[name].method,
    }));
  }

  return { route, listTools, TOOL_MAP };
}

module.exports = { createMCPToolRouter, TOOL_MAP };
