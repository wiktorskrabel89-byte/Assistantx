-- Phase 2: agent runtime, memory system, multi-tenant foundation, event infrastructure
-- Adds: organizations, memberships, roles, agent_tasks, workflow_runs, tool_calls, audit_logs, approvals

-- ────────────────────────────────────────────────────────────────────
-- Organizations & Membership
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.organizations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  plan        text not null default 'free' check (plan in ('free', 'pro', 'enterprise')),
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default timezone('utc', now()),
  updated_at  timestamptz not null default timezone('utc', now())
);

create table if not exists public.org_memberships (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  role            text not null default 'member' check (role in ('owner', 'admin', 'member', 'viewer')),
  invited_at      timestamptz,
  joined_at       timestamptz not null default timezone('utc', now()),
  unique (organization_id, user_id)
);

-- ────────────────────────────────────────────────────────────────────
-- Agent tasks (durable run history)
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.agent_tasks (
  id              uuid primary key default gen_random_uuid(),
  execution_id    uuid not null,
  workflow_id     text not null,
  user_id         uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  role            text not null,
  goal            text not null,
  status          text not null default 'queued' check (status in ('queued', 'running', 'waiting_for_approval', 'completed', 'failed')),
  input           jsonb not null default '{}'::jsonb,
  output          jsonb,
  error           text,
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists agent_tasks_execution_idx   on public.agent_tasks (execution_id);
create index if not exists agent_tasks_user_status_idx on public.agent_tasks (user_id, status);
create index if not exists agent_tasks_org_idx         on public.agent_tasks (organization_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────
-- Workflow runs
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.workflow_runs (
  id              uuid primary key default gen_random_uuid(),
  workflow_id     text not null,
  execution_id    uuid not null unique,
  user_id         uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  status          text not null default 'queued' check (status in ('queued', 'running', 'waiting_for_approval', 'completed', 'failed')),
  trigger         text not null default 'user',
  input           jsonb not null default '{}'::jsonb,
  output          jsonb,
  error           text,
  cost_usd        numeric(12, 6),
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists workflow_runs_user_status_idx on public.workflow_runs (user_id, status);
create index if not exists workflow_runs_org_idx         on public.workflow_runs (organization_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────
-- Tool calls
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.tool_calls (
  id              uuid primary key default gen_random_uuid(),
  execution_id    uuid not null,
  tool_id         text not null,
  user_id         uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  policy_allowed  boolean not null,
  risk_level      text not null default 'low' check (risk_level in ('low', 'medium', 'high')),
  input_summary   text,
  output_summary  text,
  error           text,
  duration_ms     integer,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists tool_calls_execution_idx on public.tool_calls (execution_id);
create index if not exists tool_calls_tool_user_idx on public.tool_calls (tool_id, user_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────
-- Approvals
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.approvals (
  id              uuid primary key default gen_random_uuid(),
  execution_id    uuid not null,
  tool_id         text,
  workflow_id     text,
  requested_by    uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  status          text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  resolved_by     uuid references auth.users(id) on delete set null,
  reason          text,
  context         jsonb not null default '{}'::jsonb,
  requested_at    timestamptz not null default timezone('utc', now()),
  resolved_at     timestamptz,
  expires_at      timestamptz
);

create index if not exists approvals_org_status_idx   on public.approvals (organization_id, status, requested_at desc);
create index if not exists approvals_execution_idx    on public.approvals (execution_id);

-- ────────────────────────────────────────────────────────────────────
-- Audit log
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.audit_logs (
  id              uuid primary key default gen_random_uuid(),
  event_type      text not null,
  user_id         uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  execution_id    uuid,
  target_type     text,
  target_id       text,
  payload         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists audit_logs_org_event_idx  on public.audit_logs (organization_id, event_type, created_at desc);
create index if not exists audit_logs_user_idx       on public.audit_logs (user_id, created_at desc);

-- ────────────────────────────────────────────────────────────────────
-- Row-level security
-- ────────────────────────────────────────────────────────────────────

alter table public.organizations    enable row level security;
alter table public.org_memberships  enable row level security;
alter table public.agent_tasks      enable row level security;
alter table public.workflow_runs    enable row level security;
alter table public.tool_calls       enable row level security;
alter table public.approvals        enable row level security;
alter table public.audit_logs       enable row level security;

-- Helper: is authenticated user a member of the given org?
create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.org_memberships
    where organization_id = org_id and user_id = auth.uid()
  );
$$;

-- Helper: is authenticated user an admin or owner of the given org?
create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql security definer stable
as $$
  select exists (
    select 1 from public.org_memberships
    where organization_id = org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

do $$
begin
  -- organizations
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='organizations' and policyname='orgs_select_member') then
    create policy orgs_select_member on public.organizations
      for select using (public.is_org_member(id));
  end if;

  -- org_memberships
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='org_memberships' and policyname='memberships_select_own') then
    create policy memberships_select_own on public.org_memberships
      for select using (auth.uid() = user_id or public.is_org_admin(organization_id));
  end if;

  -- agent_tasks
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='agent_tasks' and policyname='agent_tasks_select_own') then
    create policy agent_tasks_select_own on public.agent_tasks
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='agent_tasks' and policyname='agent_tasks_insert_own') then
    create policy agent_tasks_insert_own on public.agent_tasks
      for insert with check (auth.uid() = user_id);
  end if;

  -- workflow_runs
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='workflow_runs' and policyname='workflow_runs_select_own') then
    create policy workflow_runs_select_own on public.workflow_runs
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='workflow_runs' and policyname='workflow_runs_insert_own') then
    create policy workflow_runs_insert_own on public.workflow_runs
      for insert with check (auth.uid() = user_id);
  end if;

  -- tool_calls
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tool_calls' and policyname='tool_calls_select_own') then
    create policy tool_calls_select_own on public.tool_calls
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='tool_calls' and policyname='tool_calls_insert_own') then
    create policy tool_calls_insert_own on public.tool_calls
      for insert with check (auth.uid() = user_id);
  end if;

  -- approvals
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='approvals' and policyname='approvals_select_member') then
    create policy approvals_select_member on public.approvals
      for select using (
        auth.uid() = requested_by
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='approvals' and policyname='approvals_insert_own') then
    create policy approvals_insert_own on public.approvals
      for insert with check (auth.uid() = requested_by);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='approvals' and policyname='approvals_update_admin') then
    create policy approvals_update_admin on public.approvals
      for update using (
        organization_id is not null and public.is_org_admin(organization_id)
      );
  end if;

  -- audit_logs
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='audit_logs_select_admin') then
    create policy audit_logs_select_admin on public.audit_logs
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_admin(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='audit_logs' and policyname='audit_logs_insert') then
    create policy audit_logs_insert on public.audit_logs
      for insert with check (true);
  end if;
end
$$;
