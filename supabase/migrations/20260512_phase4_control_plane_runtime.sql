-- Phase 4 (Sprint 1): Canonical control-plane runtime model
-- Adds trusted devices, sessions, presence, mesh/network metadata, runtime
-- capabilities, workflow checkpoints, and approval policies.
--
-- Canonical approval table: public.approvals
-- Legacy compatibility: backfill from public.approval_requests when present.

-- ─────────────────────────────────────────────────────────────────────────────
-- Devices (trusted controller/runtime identities)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.devices (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  organization_id     uuid references public.organizations(id) on delete set null,
  platform            text not null check (platform in ('android', 'desktop', 'web', 'server')),
  role                text not null check (role in ('control', 'runtime', 'operator')),
  label               text,
  fingerprint_hash    text,
  trust_state         text not null default 'pending'
                        check (trust_state in ('pending', 'trusted', 'revoked', 'compromised')),
  pair_code           text,
  pair_code_expires_at timestamptz,
  trust_key_hash      text,
  consent_profile     jsonb not null default '{}'::jsonb,
  metadata            jsonb not null default '{}'::jsonb,
  last_seen_at        timestamptz,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

create index if not exists devices_user_idx on public.devices (user_id, created_at desc);
create index if not exists devices_org_idx on public.devices (organization_id, created_at desc);
create index if not exists devices_trust_state_idx on public.devices (trust_state);
create index if not exists devices_pair_code_idx on public.devices (pair_code, trust_state);
create unique index if not exists devices_user_fingerprint_unique
  on public.devices (user_id, fingerprint_hash)
  where fingerprint_hash is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Device sessions (authenticated realtime/runtime sessions)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.device_sessions (
  id                  uuid primary key default gen_random_uuid(),
  device_id           uuid not null references public.devices(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  organization_id     uuid references public.organizations(id) on delete set null,
  session_token_hash  text not null,
  resume_token_hash   text,
  status              text not null default 'active'
                        check (status in ('active', 'closed', 'expired', 'revoked')),
  started_at          timestamptz not null default timezone('utc', now()),
  last_heartbeat_at   timestamptz not null default timezone('utc', now()),
  ended_at            timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default timezone('utc', now())
);

create index if not exists device_sessions_device_idx on public.device_sessions (device_id, status, started_at desc);
create index if not exists device_sessions_user_idx on public.device_sessions (user_id, status, started_at desc);
create unique index if not exists device_sessions_resume_token_hash_unique
  on public.device_sessions (resume_token_hash)
  where resume_token_hash is not null;

-- ─────────────────────────────────────────────────────────────────────────────
-- Device presence (latest heartbeat snapshot per runtime device)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.device_presence (
  device_id           uuid primary key references public.devices(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  organization_id     uuid references public.organizations(id) on delete set null,
  status              text not null default 'offline'
                        check (status in ('offline', 'booting', 'online', 'busy', 'gaming', 'sleeping', 'idle')),
  active_apps         jsonb not null default '[]'::jsonb,
  cpu_percent         numeric(5, 2),
  ram_percent         numeric(5, 2),
  network_mode        text not null default 'unknown'
                        check (network_mode in ('mesh_direct', 'relay', 'lan', 'unknown')),
  is_online           boolean not null default false,
  last_heartbeat_at   timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

create index if not exists device_presence_user_online_idx on public.device_presence (user_id, is_online, updated_at desc);
create index if not exists device_presence_org_online_idx on public.device_presence (organization_id, is_online, updated_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Network peers (mesh / relay / lan connectivity metadata)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.network_peers (
  id                  uuid primary key default gen_random_uuid(),
  device_id           uuid not null references public.devices(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  organization_id     uuid references public.organizations(id) on delete set null,
  provider            text not null check (provider in ('tailscale', 'relay', 'lan', 'custom')),
  node_id             text,
  mesh_ip             inet,
  hostname            text,
  mac_address         text,
  direct_connected    boolean not null default false,
  relay_connected     boolean not null default false,
  eligible_for_wake   boolean not null default false,
  last_seen_at        timestamptz not null default timezone('utc', now()),
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

create index if not exists network_peers_device_idx on public.network_peers (device_id, provider, updated_at desc);
create index if not exists network_peers_user_idx on public.network_peers (user_id, provider, updated_at desc);
create unique index if not exists network_peers_device_provider_unique
  on public.network_peers (device_id, provider);

-- ─────────────────────────────────────────────────────────────────────────────
-- Runtime capabilities (consent-aware feature flags per device)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.runtime_capabilities (
  id                  uuid primary key default gen_random_uuid(),
  device_id           uuid not null references public.devices(id) on delete cascade,
  user_id             uuid not null references auth.users(id) on delete cascade,
  organization_id     uuid references public.organizations(id) on delete set null,
  capability_key      text not null,
  enabled             boolean not null default false,
  requires_consent    boolean not null default true,
  consent_version     integer not null default 1,
  consented_at        timestamptz,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now()),
  unique (device_id, capability_key)
);

create index if not exists runtime_capabilities_user_idx on public.runtime_capabilities (user_id, capability_key);

-- ─────────────────────────────────────────────────────────────────────────────
-- Workflow checkpoints (durable step-level execution checkpoints)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.workflow_checkpoints (
  id                  uuid primary key default gen_random_uuid(),
  execution_id        text not null,
  workflow_id         text not null,
  user_id             uuid references auth.users(id) on delete set null,
  organization_id     uuid references public.organizations(id) on delete set null,
  step_key            text not null,
  status              text not null default 'running'
                        check (status in ('queued', 'running', 'waiting_for_approval', 'completed', 'failed', 'cancelled', 'retrying', 'expired')),
  payload             jsonb not null default '{}'::jsonb,
  error               text,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now()),
  unique (execution_id, step_key)
);

create index if not exists workflow_checkpoints_execution_idx on public.workflow_checkpoints (execution_id, created_at);
create index if not exists workflow_checkpoints_org_idx on public.workflow_checkpoints (organization_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- Approval policies (hybrid approval model configuration)
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.approval_policies (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid references public.organizations(id) on delete cascade,
  user_id             uuid references auth.users(id) on delete cascade,
  device_id           uuid references public.devices(id) on delete cascade,
  action_pattern      text not null,
  risk_level          text not null default 'medium'
                        check (risk_level in ('low', 'medium', 'high', 'critical')),
  approval_mode       text not null default 'per_action'
                        check (approval_mode in ('per_action', 'workflow_token', 'pre_approved', 'deny')),
  is_enabled          boolean not null default true,
  metadata            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default timezone('utc', now()),
  updated_at          timestamptz not null default timezone('utc', now())
);

create index if not exists approval_policies_org_idx on public.approval_policies (organization_id, risk_level, is_enabled);
create index if not exists approval_policies_user_idx on public.approval_policies (user_id, risk_level, is_enabled);

-- ─────────────────────────────────────────────────────────────────────────────
-- Canonical approvals backfill from legacy approval_requests (if present)
-- ─────────────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (
    select 1 from information_schema.tables
    where table_schema = 'public' and table_name = 'approval_requests'
  ) then
    insert into public.approvals (
      id, execution_id, tool_id, workflow_id, requested_by, organization_id,
      status, resolved_by, reason, context, requested_at, resolved_at, expires_at
    )
    select
      ar.id, ar.execution_id::uuid, ar.tool_id, ar.workflow_id, ar.requested_by,
      ar.organization_id, ar.status, ar.resolved_by, ar.reason, ar.context,
      ar.created_at, ar.resolved_at, ar.expires_at
    from public.approval_requests ar
    where ar.execution_id ~* '^[0-9a-f-]{36}$'
      and not exists (select 1 from public.approvals a where a.id = ar.id);
  end if;
exception
  when others then
    null;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS and policies
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.devices enable row level security;
alter table public.device_sessions enable row level security;
alter table public.device_presence enable row level security;
alter table public.network_peers enable row level security;
alter table public.runtime_capabilities enable row level security;
alter table public.workflow_checkpoints enable row level security;
alter table public.approval_policies enable row level security;

do $$
begin
  -- devices
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='devices' and policyname='devices_select_own_or_org') then
    create policy devices_select_own_or_org on public.devices
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='devices' and policyname='devices_insert_own') then
    create policy devices_insert_own on public.devices
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='devices' and policyname='devices_update_own_or_org_admin') then
    create policy devices_update_own_or_org_admin on public.devices
      for update using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_admin(organization_id))
      )
      with check (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;

  -- device_sessions
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='device_sessions' and policyname='device_sessions_select_own_or_org') then
    create policy device_sessions_select_own_or_org on public.device_sessions
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='device_sessions' and policyname='device_sessions_insert_own') then
    create policy device_sessions_insert_own on public.device_sessions
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='device_sessions' and policyname='device_sessions_update_own_or_org_admin') then
    create policy device_sessions_update_own_or_org_admin on public.device_sessions
      for update using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;

  -- device_presence
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='device_presence' and policyname='device_presence_select_own_or_org') then
    create policy device_presence_select_own_or_org on public.device_presence
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='device_presence' and policyname='device_presence_insert_own') then
    create policy device_presence_insert_own on public.device_presence
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='device_presence' and policyname='device_presence_update_own_or_org_admin') then
    create policy device_presence_update_own_or_org_admin on public.device_presence
      for update using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;

  -- network_peers
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='network_peers' and policyname='network_peers_select_own_or_org') then
    create policy network_peers_select_own_or_org on public.network_peers
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='network_peers' and policyname='network_peers_insert_own') then
    create policy network_peers_insert_own on public.network_peers
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='network_peers' and policyname='network_peers_update_own_or_org_admin') then
    create policy network_peers_update_own_or_org_admin on public.network_peers
      for update using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;

  -- runtime_capabilities
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='runtime_capabilities' and policyname='runtime_capabilities_select_own_or_org') then
    create policy runtime_capabilities_select_own_or_org on public.runtime_capabilities
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='runtime_capabilities' and policyname='runtime_capabilities_insert_own') then
    create policy runtime_capabilities_insert_own on public.runtime_capabilities
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='runtime_capabilities' and policyname='runtime_capabilities_update_own_or_org_admin') then
    create policy runtime_capabilities_update_own_or_org_admin on public.runtime_capabilities
      for update using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;

  -- workflow_checkpoints
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='workflow_checkpoints' and policyname='workflow_checkpoints_select_own_or_org') then
    create policy workflow_checkpoints_select_own_or_org on public.workflow_checkpoints
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='workflow_checkpoints' and policyname='workflow_checkpoints_insert_own') then
    create policy workflow_checkpoints_insert_own on public.workflow_checkpoints
      for insert with check (
        user_id is null or auth.uid() = user_id
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='workflow_checkpoints' and policyname='workflow_checkpoints_update_own_or_org_admin') then
    create policy workflow_checkpoints_update_own_or_org_admin on public.workflow_checkpoints
      for update using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;

  -- approval_policies
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='approval_policies' and policyname='approval_policies_select_scope') then
    create policy approval_policies_select_scope on public.approval_policies
      for select using (
        (user_id is not null and auth.uid() = user_id)
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='approval_policies' and policyname='approval_policies_insert_scope') then
    create policy approval_policies_insert_scope on public.approval_policies
      for insert with check (
        (user_id is not null and auth.uid() = user_id)
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='approval_policies' and policyname='approval_policies_update_scope') then
    create policy approval_policies_update_scope on public.approval_policies
      for update using (
        (user_id is not null and auth.uid() = user_id)
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;
end
$$;
