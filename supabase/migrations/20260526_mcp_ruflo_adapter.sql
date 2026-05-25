-- Add Ruflo as installable MCP server (Path B production registration).

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
    'operating-system',
    'ruflo'
  ));

insert into public.plugin_manifests (
  plugin_id, name, version, description, author, homepage,
  capabilities, required_scopes,
  sandboxed, trusted_publisher, status
) values (
  'mcp-ruflo',
  'Ruflo Swarm Orchestrator',
  '0.1.0',
  'External multi-agent orchestrator adapter (Queen/Worker) with governed MCP invocation for AssistantX runtime.',
  'AssistantX',
  'https://github.com/ruvnet/ruflo',
  '["swarm_init","agent_spawn","memory_store","train_pipeline","health"]'::jsonb,
  '["mcp:call","runtime:swarm"]'::jsonb,
  true,
  true,
  'approved'
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
) values (
  'mcp-ruflo', 'official', 'developer', 0, 5.00, 0
)
on conflict (plugin_id) do update
set trust_level = excluded.trust_level,
    category = excluded.category;

