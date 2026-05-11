-- Phase 3: MCP registry, events ledger, permissions, cost records, rate limit entries

-- ────────────────────────────────────────────────────────────────────
-- MCP server registry
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.mcp_server_registrations (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  url             text not null,
  trust_level     text not null default 'sandboxed' check (trust_level in ('trusted', 'verified', 'sandboxed')),
  capabilities    jsonb not null default '[]'::jsonb,
  credential_ref  text,
  organization_id uuid references public.organizations(id) on delete cascade,
  enabled         boolean not null default true,
  created_at      timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now())
);

create index if not exists mcp_servers_org_idx on public.mcp_server_registrations (organization_id, enabled);

-- ────────────────────────────────────────────────────────────────────
-- Runtime events ledger (replayable)
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.runtime_events (
  id              uuid primary key default gen_random_uuid(),
  event_type      text not null,
  user_id         uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  execution_id    uuid,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists runtime_events_exec_idx    on public.runtime_events (execution_id);
create index if not exists runtime_events_org_type_idx on public.runtime_events (organization_id, event_type, created_at desc);

-- ────────────────────────────────────────────────────────────────────
-- Permissions (fine-grained per-resource)
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.permissions (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  resource_type   text not null,
  resource_id     text,
  permission      text not null,
  granted_by      uuid references auth.users(id) on delete set null,
  granted_at      timestamptz not null default timezone('utc', now()),
  expires_at      timestamptz,
  unique (organization_id, user_id, resource_type, resource_id, permission)
);

create index if not exists permissions_user_resource_idx on public.permissions (user_id, resource_type, resource_id);

-- ────────────────────────────────────────────────────────────────────
-- Cost records
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.cost_records (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  execution_id    uuid,
  workflow_id     text,
  tool_id         text,
  lane            text not null default 'chat' check (lane in ('classification', 'chat', 'reasoning', 'premium')),
  model           text not null,
  input_tokens    integer not null default 0,
  output_tokens   integer not null default 0,
  estimated_usd   numeric(12, 6) not null default 0,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists cost_records_user_idx on public.cost_records (user_id, created_at desc);
create index if not exists cost_records_org_idx  on public.cost_records (organization_id, created_at desc);
create index if not exists cost_records_exec_idx on public.cost_records (execution_id);

-- ────────────────────────────────────────────────────────────────────
-- Rate limit entries
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.rate_limit_entries (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,
  count       integer not null default 1,
  window_start timestamptz not null default timezone('utc', now()),
  window_end  timestamptz not null
);

create index if not exists rate_limit_key_idx on public.rate_limit_entries (key, window_end);

-- ────────────────────────────────────────────────────────────────────
-- Row-level security
-- ────────────────────────────────────────────────────────────────────

alter table public.mcp_server_registrations enable row level security;
alter table public.runtime_events           enable row level security;
alter table public.permissions              enable row level security;
alter table public.cost_records             enable row level security;
alter table public.rate_limit_entries       enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mcp_server_registrations' and policyname='mcp_servers_select_org') then
    create policy mcp_servers_select_org on public.mcp_server_registrations
      for select using (
        organization_id is null
        or public.is_org_member(organization_id)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='mcp_server_registrations' and policyname='mcp_servers_manage_admin') then
    create policy mcp_servers_manage_admin on public.mcp_server_registrations
      for all using (public.is_org_admin(organization_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='runtime_events' and policyname='runtime_events_select_own') then
    create policy runtime_events_select_own on public.runtime_events
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='runtime_events' and policyname='runtime_events_insert') then
    create policy runtime_events_insert on public.runtime_events
      for insert with check (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cost_records' and policyname='cost_records_select_own') then
    create policy cost_records_select_own on public.cost_records
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='cost_records' and policyname='cost_records_insert') then
    create policy cost_records_insert on public.cost_records
      for insert with check (auth.uid() = user_id or user_id is null);
  end if;
end
$$;
