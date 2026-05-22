create table if not exists public.command_registry (
  id text primary key,
  slash text not null unique,
  title text not null,
  description text not null,
  category text not null,
  execution_mode text not null check (execution_mode in ('local_only', 'remote_on_paired_device', 'cloud_direct', 'hybrid_dual')),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  requires_desktop boolean not null default false,
  aliases jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  enabled boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.command_execution_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid references public.devices(id) on delete set null,
  command_id text not null references public.command_registry(id) on delete restrict,
  slash text not null,
  matched_by text not null check (matched_by in ('slash', 'alias')),
  source text not null check (source in ('web', 'desktop')),
  execution_mode text not null check (execution_mode in ('local_only', 'remote_on_paired_device', 'cloud_direct', 'hybrid_dual')),
  status text not null check (status in ('queued', 'completed', 'failed', 'blocked')),
  args_text text not null default '',
  correlation_id text,
  route_reason text,
  result_summary text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists command_execution_history_user_created_idx
  on public.command_execution_history (user_id, created_at desc);

create index if not exists command_execution_history_device_created_idx
  on public.command_execution_history (device_id, created_at desc);

create index if not exists command_execution_history_command_created_idx
  on public.command_execution_history (command_id, created_at desc);

create table if not exists public.device_capability_snapshots (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references public.devices(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_source text not null check (snapshot_source in ('desktop', 'worker', 'web')),
  runtime_online boolean not null default false,
  local_commands jsonb not null default '[]'::jsonb,
  cloud_commands jsonb not null default '[]'::jsonb,
  local_servers jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  captured_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists device_capability_snapshots_device_captured_idx
  on public.device_capability_snapshots (device_id, captured_at desc);

create index if not exists device_capability_snapshots_user_captured_idx
  on public.device_capability_snapshots (user_id, captured_at desc);

alter table public.command_execution_history enable row level security;
alter table public.command_execution_history force row level security;

alter table public.device_capability_snapshots enable row level security;
alter table public.device_capability_snapshots force row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'command_execution_history'
      and policyname = 'command_execution_history_select_own'
  ) then
    create policy command_execution_history_select_own
      on public.command_execution_history
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'command_execution_history'
      and policyname = 'command_execution_history_insert_own'
  ) then
    create policy command_execution_history_insert_own
      on public.command_execution_history
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'device_capability_snapshots'
      and policyname = 'device_capability_snapshots_select_own'
  ) then
    create policy device_capability_snapshots_select_own
      on public.device_capability_snapshots
      for select
      to authenticated
      using (user_id = auth.uid());
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'device_capability_snapshots'
      and policyname = 'device_capability_snapshots_insert_own'
  ) then
    create policy device_capability_snapshots_insert_own
      on public.device_capability_snapshots
      for insert
      to authenticated
      with check (user_id = auth.uid());
  end if;
end $$;

insert into public.command_registry (
  id,
  slash,
  title,
  description,
  category,
  execution_mode,
  risk_level,
  requires_desktop,
  aliases,
  examples,
  enabled
)
values
  ('os', '/os', 'System status', 'Read CPU, memory, and runtime status from Jarvis.', 'system', 'local_only', 'low', true, '["status","system","hardware","cpu"]'::jsonb, '["/os","system status"]'::jsonb, true),
  ('game', '/game', 'Launch game', 'Launch a game on the paired Jarvis desktop.', 'system', 'remote_on_paired_device', 'medium', true, '["uruchom","odpal","graj"]'::jsonb, '["/game roblox","uruchom roblox"]'::jsonb, true),
  ('open', '/open', 'Open app', 'Open an application or desktop target on the paired Jarvis device.', 'system', 'remote_on_paired_device', 'medium', true, '["open","launch","otwórz","włącz"]'::jsonb, '["/open opera","otwórz vscode"]'::jsonb, true),
  ('screenshot', '/screenshot', 'Take screenshot', 'Capture a screenshot on the paired Jarvis device.', 'system', 'remote_on_paired_device', 'low', true, '["screen","zrzut","screenshot"]'::jsonb, '["/screenshot"]'::jsonb, true),
  ('sleep', '/sleep', 'Sleep PC', 'Put the paired Jarvis desktop to sleep.', 'system', 'remote_on_paired_device', 'high', true, '["sleep","hibernate","uśpij"]'::jsonb, '["/sleep"]'::jsonb, true),
  ('repo', '/repo', 'Repo status', 'Inspect the local repository workspace on the paired Jarvis device.', 'repo', 'local_only', 'low', true, '["repo","repository"]'::jsonb, '["/repo"]'::jsonb, true),
  ('index', '/index', 'Index repo', 'Refresh the local Jarvis file index for the paired workspace.', 'repo', 'local_only', 'medium', true, '["index","scan repo","indeksuj"]'::jsonb, '["/index"]'::jsonb, true),
  ('file', '/file', 'Read file', 'Read a local file from the paired Jarvis device.', 'repo', 'remote_on_paired_device', 'low', true, '["file","read file","plik"]'::jsonb, '["/file README.md"]'::jsonb, true),
  ('search', '/search', 'Search workspace', 'Search the local Jarvis workspace for files or matching text.', 'repo', 'remote_on_paired_device', 'low', true, '["search","find","szukaj"]'::jsonb, '["/search auth callback"]'::jsonb, true),
  ('ignore', '/ignore', 'Update ignore rules', 'Manage the Jarvis local ignore list for repo scans.', 'repo', 'local_only', 'medium', true, '["ignore","pomijaj"]'::jsonb, '["/ignore node_modules"]'::jsonb, true),
  ('today', '/today', 'Today', 'Show upcoming Google Calendar events.', 'google', 'cloud_direct', 'low', false, '["plan","dzisiaj","agenda","today"]'::jsonb, '["/today"]'::jsonb, true),
  ('calendar', '/calendar', 'Calendar', 'Create a Google Calendar event.', 'google', 'cloud_direct', 'medium', false, '["calendar","kalendarz","spotkanie"]'::jsonb, '["/calendar Team sync tomorrow 10:00"]'::jsonb, true),
  ('gmail', '/gmail', 'Gmail', 'Read or summarize Gmail inbox messages.', 'google', 'cloud_direct', 'low', false, '["gmail","mail","email","poczta"]'::jsonb, '["/gmail invoices"]'::jsonb, true),
  ('draft', '/draft', 'Draft email', 'Prepare an email draft workflow.', 'google', 'cloud_direct', 'medium', false, '["draft","szkic","napisz mail"]'::jsonb, '["/draft Demo follow-up"]'::jsonb, true),
  ('drive', '/drive', 'Google Drive', 'Import or inspect a Google Drive file.', 'google', 'cloud_direct', 'low', false, '["drive","dysk","google drive"]'::jsonb, '["/drive <share link>"]'::jsonb, true),
  ('web', '/web', 'Fetch webpage', 'Fetch and summarize a webpage URL.', 'web', 'cloud_direct', 'low', false, '["web","website","page","strona"]'::jsonb, '["/web https://example.com"]'::jsonb, true),
  ('google', '/google', 'Web search', 'Run a fresh web search.', 'web', 'cloud_direct', 'low', false, '["google","search web","wyszukaj"]'::jsonb, '["/google latest next.js 16"]'::jsonb, true),
  ('slack', '/slack', 'Slack', 'Read Slack channels or message history.', 'web', 'cloud_direct', 'medium', false, '["slack"]'::jsonb, '["/slack #general"]'::jsonb, true),
  ('db', '/db', 'Database query', 'Run a local database query on the paired Jarvis device.', 'repo', 'local_only', 'high', true, '["db","database","postgres","sql"]'::jsonb, '["/db select now()"]'::jsonb, true),
  ('skills', '/skills', 'Skills', 'Show cloud integrations and local PC/runtime capabilities in one merged view.', 'jarvis', 'hybrid_dual', 'low', false, '["skills","capabilities","tools"]'::jsonb, '["/skills"]'::jsonb, true)
on conflict (id) do update
set
  slash = excluded.slash,
  title = excluded.title,
  description = excluded.description,
  category = excluded.category,
  execution_mode = excluded.execution_mode,
  risk_level = excluded.risk_level,
  requires_desktop = excluded.requires_desktop,
  aliases = excluded.aliases,
  examples = excluded.examples,
  enabled = excluded.enabled,
  updated_at = timezone('utc', now());
