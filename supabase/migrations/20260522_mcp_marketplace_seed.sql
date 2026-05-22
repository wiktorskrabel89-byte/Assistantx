-- Phase 2: seed 10 official MCP server entries
-- Inserts into plugin_manifests (approved, trusted) and marketplace_listings (official)
-- Uses ON CONFLICT DO NOTHING so re-running the migration is safe.

insert into public.plugin_manifests (
  plugin_id, name, version, description, author, homepage,
  capabilities, required_scopes,
  sandboxed, trusted_publisher, status
) values
(
  'mcp-github',
  'GitHub MCP Server',
  '0.1.0',
  'Reads source code, analyses commit history, and manages Issues and Pull Requests directly on GitHub. Ideal for giga-repository analysis.',
  'Anthropic / ModelContextProtocol',
  'https://github.com/modelcontextprotocol/servers/tree/main/src/github',
  '["search_repositories","get_file_contents","list_commits","get_commit","list_issues","get_issue","list_pull_requests","get_pull_request","create_issue","create_pull_request"]'::jsonb,
  '["github:pat"]'::jsonb,
  true, true, 'approved'
),
(
  'mcp-filesystem',
  'Filesystem MCP Server',
  '0.1.0',
  'Secure, read-only access to any project folder on the local disk for code analysis without network exposure.',
  'Anthropic / ModelContextProtocol',
  'https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem',
  '["read_file","read_multiple_files","list_directory","directory_tree","search_files","get_file_info"]'::jsonb,
  '["filesystem:local_path"]'::jsonb,
  true, true, 'approved'
),
(
  'mcp-google-calendar',
  'Google Calendar MCP Server',
  '0.1.0',
  'Analyses your schedule, detects conflicts, plans meetings, and retrieves the agenda on demand via Google Calendar.',
  'Anthropic / ModelContextProtocol',
  'https://github.com/modelcontextprotocol/servers/tree/main/src/google-calendar',
  '["list_events","create_event","update_event","delete_event","get_calendar","list_calendars"]'::jsonb,
  '["google:calendar"]'::jsonb,
  true, true, 'approved'
),
(
  'mcp-gmail',
  'Gmail MCP Server',
  '0.1.0',
  'Searches and analyses email content, extracts key threads, categorises messages, and drafts replies.',
  'Anthropic / ModelContextProtocol',
  'https://github.com/modelcontextprotocol/servers/tree/main/src/gmail',
  '["list_messages","get_message","search_messages","send_message","draft_message","list_labels"]'::jsonb,
  '["google:gmail"]'::jsonb,
  true, true, 'approved'
),
(
  'mcp-google-drive',
  'Google Drive MCP Server',
  '0.1.0',
  'Searches the cloud structure and reads Google Docs, Sheets, and text files to extract knowledge.',
  'Anthropic / ModelContextProtocol',
  'https://github.com/modelcontextprotocol/servers/tree/main/src/google-drive',
  '["search_files","read_file","list_files","export_file","get_file_metadata"]'::jsonb,
  '["google:drive"]'::jsonb,
  true, true, 'approved'
),
(
  'mcp-postgres',
  'PostgreSQL MCP Server',
  '0.1.0',
  'Analyses table structures and allows natural-language questions against local or cloud SQL databases.',
  'Anthropic / ModelContextProtocol',
  'https://github.com/modelcontextprotocol/servers/tree/main/src/postgres',
  '["query","list_tables","describe_table","list_schemas"]'::jsonb,
  '["postgres:uri"]'::jsonb,
  true, true, 'approved'
),
(
  'mcp-fetch',
  'Web Fetch MCP Server',
  '0.1.0',
  'Fetches clean text from any URL so Jarvis can analyse articles, documentation, and web pages.',
  'Anthropic / ModelContextProtocol',
  'https://github.com/modelcontextprotocol/servers/tree/main/src/fetch',
  '["fetch","fetch_markdown","fetch_html","fetch_raw"]'::jsonb,
  '[]'::jsonb,
  true, true, 'approved'
),
(
  'mcp-brave-search',
  'Brave Search MCP Server',
  '0.1.0',
  'Gives Jarvis direct access to live web search results to supplement its knowledge with the latest information.',
  'Anthropic / ModelContextProtocol',
  'https://github.com/modelcontextprotocol/servers/tree/main/src/brave-search',
  '["brave_web_search","brave_local_search","brave_news_search","brave_image_search"]'::jsonb,
  '["brave:api_key"]'::jsonb,
  true, true, 'approved'
),
(
  'mcp-slack',
  'Slack MCP Server',
  '0.1.0',
  'Analyses channel history, summarises team discussions, and can post messages on your behalf.',
  'Anthropic / ModelContextProtocol',
  'https://github.com/modelcontextprotocol/servers/tree/main/src/slack',
  '["list_channels","get_channel_history","get_thread_replies","post_message","list_users","get_user_profile"]'::jsonb,
  '["slack:bot_token"]'::jsonb,
  true, true, 'approved'
),
(
  'mcp-memory',
  'Memory MCP Server',
  '0.1.0',
  'Local knowledge base that lets Jarvis remember context from previous conversations and user preferences.',
  'Anthropic / ModelContextProtocol',
  'https://github.com/modelcontextprotocol/servers/tree/main/src/memory',
  '["create_entities","create_relations","add_observations","delete_entities","delete_observations","delete_relations","read_graph","search_nodes","open_nodes"]'::jsonb,
  '[]'::jsonb,
  true, true, 'approved'
)
on conflict (plugin_id) do nothing;

-- Corresponding marketplace listings

insert into public.marketplace_listings (
  plugin_id, trust_level, category, downloads, rating, review_count
)
select plugin_id,
       'official',
       case plugin_id
         when 'mcp-github'           then 'developer'
         when 'mcp-filesystem'       then 'developer'
         when 'mcp-google-calendar'  then 'productivity'
         when 'mcp-gmail'            then 'productivity'
         when 'mcp-google-drive'     then 'productivity'
         when 'mcp-postgres'         then 'database'
         when 'mcp-fetch'            then 'web'
         when 'mcp-brave-search'     then 'web'
         when 'mcp-slack'            then 'communication'
         when 'mcp-memory'           then 'memory'
       end,
       0, 5.00, 0
from public.plugin_manifests
where plugin_id in (
  'mcp-github', 'mcp-filesystem', 'mcp-google-calendar', 'mcp-gmail',
  'mcp-google-drive', 'mcp-postgres', 'mcp-fetch', 'mcp-brave-search',
  'mcp-slack', 'mcp-memory'
)
on conflict (plugin_id) do nothing;
