-- Phase 1: per-user MCP server installation tracking

create table if not exists public.mcp_server_installations (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  server_id        text not null,
  enabled          boolean not null default true,
  config_encrypted text,
  installed_at     timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now()),
  constraint mcp_server_installations_server_id_check
    check (server_id in (
      'github',
      'filesystem',
      'google-calendar',
      'gmail',
      'google-drive',
      'postgres',
      'fetch',
      'brave-search',
      'slack',
      'memory'
    )),
  unique (user_id, server_id)
);

create index if not exists mcp_server_installations_user_idx
  on public.mcp_server_installations (user_id, server_id);

create index if not exists mcp_server_installations_enabled_idx
  on public.mcp_server_installations (user_id, enabled);

alter table public.mcp_server_installations enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mcp_server_installations'
      and policyname = 'mcp_installs_select_own'
  ) then
    create policy mcp_installs_select_own on public.mcp_server_installations
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mcp_server_installations'
      and policyname = 'mcp_installs_insert_own'
  ) then
    create policy mcp_installs_insert_own on public.mcp_server_installations
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mcp_server_installations'
      and policyname = 'mcp_installs_update_own'
  ) then
    create policy mcp_installs_update_own on public.mcp_server_installations
      for update using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'mcp_server_installations'
      and policyname = 'mcp_installs_delete_own'
  ) then
    create policy mcp_installs_delete_own on public.mcp_server_installations
      for delete using (auth.uid() = user_id);
  end if;
end
$$;

-- Auto-update updated_at on row changes
create or replace function public.set_mcp_installation_updated_at()
  returns trigger
  language plpgsql
  set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists mcp_installations_set_updated_at
  on public.mcp_server_installations;

create trigger mcp_installations_set_updated_at
  before update on public.mcp_server_installations
  for each row execute function public.set_mcp_installation_updated_at();
