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
  fs_read_file:           { serverId: 'filesystem', method: 'read_file' },
  fs_read_multiple_files: { serverId: 'filesystem', method: 'read_multiple_files' },
  fs_list_directory:      { serverId: 'filesystem', method: 'list_directory' },
  fs_directory_tree:      { serverId: 'filesystem', method: 'directory_tree' },
  fs_search_files:        { serverId: 'filesystem', method: 'search_files' },
  fs_get_file_info:       { serverId: 'filesystem', method: 'get_file_info' },

  // ── Google Calendar ───────────────────────────────────────────────────────
  calendar_list_events:   { serverId: 'google-calendar', method: 'list_events' },
  calendar_create_event:  { serverId: 'google-calendar', method: 'create_event' },
  calendar_update_event:  { serverId: 'google-calendar', method: 'update_event' },
  calendar_delete_event:  { serverId: 'google-calendar', method: 'delete_event' },
  calendar_get_calendar:  { serverId: 'google-calendar', method: 'get_calendar' },
  calendar_list_calendars:{ serverId: 'google-calendar', method: 'list_calendars' },

  // ── Gmail ─────────────────────────────────────────────────────────────────
  gmail_list_messages:  { serverId: 'gmail', method: 'list_messages' },
  gmail_get_message:    { serverId: 'gmail', method: 'get_message' },
  gmail_search:         { serverId: 'gmail', method: 'search_messages' },
  gmail_send_message:   { serverId: 'gmail', method: 'send_message' },
  gmail_draft_message:  { serverId: 'gmail', method: 'draft_message' },
  gmail_list_labels:    { serverId: 'gmail', method: 'list_labels' },

  // ── Google Drive ──────────────────────────────────────────────────────────
  drive_search_files:   { serverId: 'google-drive', method: 'search_files' },
  drive_read_file:      { serverId: 'google-drive', method: 'read_file' },
  drive_list_files:     { serverId: 'google-drive', method: 'list_files' },
  drive_export_file:    { serverId: 'google-drive', method: 'export_file' },
  drive_get_metadata:   { serverId: 'google-drive', method: 'get_file_metadata' },

  // ── PostgreSQL ────────────────────────────────────────────────────────────
  db_query:          { serverId: 'postgres', method: 'query' },
  db_list_tables:    { serverId: 'postgres', method: 'list_tables' },
  db_describe_table: { serverId: 'postgres', method: 'describe_table' },
  db_list_schemas:   { serverId: 'postgres', method: 'list_schemas' },

  // ── Web Fetch ─────────────────────────────────────────────────────────────
  web_fetch:          { serverId: 'fetch', method: 'fetch' },
  web_fetch_markdown: { serverId: 'fetch', method: 'fetch_markdown' },
  web_fetch_html:     { serverId: 'fetch', method: 'fetch_html' },
  web_fetch_raw:      { serverId: 'fetch', method: 'fetch_raw' },

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
  memory_create_entities:   { serverId: 'memory', method: 'create_entities' },
  memory_create_relations:  { serverId: 'memory', method: 'create_relations' },
  memory_add_observations:  { serverId: 'memory', method: 'add_observations' },
  memory_delete_entities:   { serverId: 'memory', method: 'delete_entities' },
  memory_delete_observations:{ serverId: 'memory', method: 'delete_observations' },
  memory_delete_relations:  { serverId: 'memory', method: 'delete_relations' },
  memory_read_graph:        { serverId: 'memory', method: 'read_graph' },
  memory_search:            { serverId: 'memory', method: 'search_nodes' },
  memory_open_nodes:        { serverId: 'memory', method: 'open_nodes' },
};

function createMCPToolRouter({ serverManager }) {
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
