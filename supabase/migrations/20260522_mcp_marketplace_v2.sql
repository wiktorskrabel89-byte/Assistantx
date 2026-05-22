-- MCP Marketplace v2: Google Suite bundle, native built-ins, and Operating System server

-- 1) Update installation constraint to new installable server IDs
alter table public.mcp_server_installations
  drop constraint if exists mcp_server_installations_server_id_check;

alter table public.mcp_server_installations
  add constraint mcp_server_installations_server_id_check
  check (server_id in (
    'github',
    'google-suite',
    'postgres',
    'brave-search',
    'slack',
    'operating-system'
  ));

-- 2) Migrate Google installs to the bundled server and remove deprecated native entries
insert into public.mcp_server_installations (user_id, server_id, enabled)
select distinct user_id, 'google-suite', true
from public.mcp_server_installations
where server_id in ('google-calendar', 'gmail', 'google-drive')
  and enabled = true
on conflict (user_id, server_id) do update
set enabled = excluded.enabled;

delete from public.mcp_server_installations
where server_id in ('google-calendar', 'gmail', 'google-drive', 'filesystem', 'fetch', 'memory');

-- 3) Update plugin manifests/listings
update public.plugin_manifests
set name = 'Local Workspace MCP Server',
    description = 'Ideal for Giga-Repository local RAG analysis — reads any project folder without leaving your machine.'
where plugin_id = 'mcp-filesystem';

delete from public.marketplace_listings
where plugin_id in ('mcp-google-calendar', 'mcp-gmail', 'mcp-google-drive');

delete from public.plugin_manifests
where plugin_id in ('mcp-google-calendar', 'mcp-gmail', 'mcp-google-drive');

insert into public.plugin_manifests (
  plugin_id, name, version, description, author, homepage,
  capabilities, required_scopes,
  sandboxed, trusted_publisher, status
) values (
  'mcp-google-suite',
  'Google Suite MCP Server',
  '0.2.0',
  'One-click Google integration for Calendar, Gmail, and Drive with a shared OAuth session and unified productivity context.',
  'AssistantX',
  'https://github.com/modelcontextprotocol/servers',
  '["list_events","create_event","update_event","delete_event","list_messages","search_messages","list_files","read_file"]'::jsonb,
  '["google:oauth2"]'::jsonb,
  true, true, 'approved'
)
on conflict (plugin_id) do update
set name = excluded.name,
    version = excluded.version,
    description = excluded.description,
    capabilities = excluded.capabilities,
    required_scopes = excluded.required_scopes,
    sandboxed = excluded.sandboxed,
    trusted_publisher = excluded.trusted_publisher,
    status = excluded.status;

insert into public.plugin_manifests (
  plugin_id, name, version, description, author, homepage,
  capabilities, required_scopes,
  sandboxed, trusted_publisher, status
) values (
  'mcp-operating-system',
  'Operating System MCP Server',
  '0.1.0',
  'Local system control for app launching, hardware telemetry, screenshots, and guarded command execution.',
  'AssistantX',
  'https://github.com/wiktorskrabel89-byte/Assistantx',
  '["launch_app","get_system_stats","take_screenshot","execute_command"]'::jsonb,
  '[]'::jsonb,
  true, true, 'approved'
)
on conflict (plugin_id) do update
set name = excluded.name,
    version = excluded.version,
    description = excluded.description,
    capabilities = excluded.capabilities,
    required_scopes = excluded.required_scopes,
    sandboxed = excluded.sandboxed,
    trusted_publisher = excluded.trusted_publisher,
    status = excluded.status;

insert into public.marketplace_listings (
  plugin_id, trust_level, category, downloads, rating, review_count
) values
  ('mcp-google-suite', 'official', 'productivity', 0, 5.00, 0),
  ('mcp-operating-system', 'official', 'system', 0, 5.00, 0)
on conflict (plugin_id) do update
set trust_level = excluded.trust_level,
    category = excluded.category;

update public.marketplace_listings
set category = 'developer'
where plugin_id = 'mcp-postgres';
