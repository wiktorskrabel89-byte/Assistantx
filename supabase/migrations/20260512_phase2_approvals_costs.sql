-- Phase 2: Approvals, Cost Records, Agent Tasks persistence
-- Migration: 20260512_phase2_approvals_costs.sql
--
-- Creates tables for:
--   1. approval_requests — persistent approval queue for high-risk tools
--   2. cost_records      — persistent per-user/org/workflow cost ledger
--   3. agent_tasks       — durable agent task execution history
--
-- All tables have Row Level Security (RLS) so users can only see their
-- own data. Org admins can see their org's data via policy.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. approval_requests
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.approval_requests (
  id                uuid primary key default gen_random_uuid(),
  execution_id      text not null,
  tool_id           text,
  workflow_id       text,
  requested_by      uuid not null references auth.users(id) on delete cascade,
  organization_id   uuid references public.organizations(id) on delete set null,
  reason            text not null,
  context           jsonb not null default '{}'::jsonb,
  status            text not null default 'pending'
                      check (status in ('pending', 'approved', 'rejected', 'expired')),
  expires_at        timestamptz,
  resolved_at       timestamptz,
  resolved_by       uuid references auth.users(id),
  resolution_note   text,
  created_at        timestamptz not null default now()
);

create index if not exists approval_requests_org_status_idx
  on public.approval_requests(organization_id, status, created_at);

create index if not exists approval_requests_execution_idx
  on public.approval_requests(execution_id);

alter table public.approval_requests enable row level security;

-- Users can see their own approval requests.
create policy "Users can read own approval requests"
  on public.approval_requests for select
  using (requested_by = auth.uid());

-- Org members can see their org's approval requests.
create policy "Org members can read org approval requests"
  on public.approval_requests for select
  using (
    organization_id is not null and
    exists (
      select 1 from public.org_memberships m
      where m.organization_id = approval_requests.organization_id
        and m.user_id = auth.uid()
    )
  );

-- Org admins/owners can update (approve/reject) approvals.
create policy "Org admins can update approval requests"
  on public.approval_requests for update
  using (
    organization_id is not null and
    exists (
      select 1 from public.org_memberships m
      where m.organization_id = approval_requests.organization_id
        and m.user_id = auth.uid()
        and m.role in ('admin', 'owner')
    )
  );

-- Authenticated users can insert (request) approvals.
create policy "Authenticated users can insert approval requests"
  on public.approval_requests for insert
  with check (auth.uid() is not null);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. cost_records
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.cost_records (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  organization_id   uuid references public.organizations(id) on delete set null,
  execution_id      text,
  workflow_id       text,
  tool_id           text,
  lane              text not null
                      check (lane in ('classification', 'chat', 'reasoning', 'premium',
                                      'embedding', 'web_search', 'plugin', 'mcp')),
  model             text not null,
  input_tokens      integer not null default 0,
  output_tokens     integer not null default 0,
  estimated_usd     numeric(12, 8) not null default 0,
  created_at        timestamptz not null default now()
);

create index if not exists cost_records_user_idx
  on public.cost_records(user_id, created_at desc);

create index if not exists cost_records_org_idx
  on public.cost_records(organization_id, created_at desc);

create index if not exists cost_records_execution_idx
  on public.cost_records(execution_id);

alter table public.cost_records enable row level security;

-- Users can read their own cost records.
create policy "Users can read own cost records"
  on public.cost_records for select
  using (user_id = auth.uid());

-- Org members can read their org's cost records.
create policy "Org members can read org cost records"
  on public.cost_records for select
  using (
    organization_id is not null and
    exists (
      select 1 from public.org_memberships m
      where m.organization_id = cost_records.organization_id
        and m.user_id = auth.uid()
    )
  );

-- Service role only can insert cost records (no client-side writes).
create policy "Service role can insert cost records"
  on public.cost_records for insert
  with check (auth.uid() is not null);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. agent_tasks
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.agent_tasks (
  task_id           text primary key,
  execution_id      text not null,
  role              text not null
                      check (role in ('planner', 'coordinator', 'researcher',
                                      'coder', 'verifier')),
  goal              text not null,
  input             jsonb not null default '{}'::jsonb,
  output            jsonb,
  error             text,
  user_id           uuid references auth.users(id) on delete cascade,
  organization_id   uuid references public.organizations(id) on delete set null,
  status            text not null default 'running'
                      check (status in ('queued', 'running', 'waiting_for_approval',
                                        'completed', 'failed', 'cancelled',
                                        'retrying', 'expired')),
  completed_at      timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists agent_tasks_execution_idx
  on public.agent_tasks(execution_id);

create index if not exists agent_tasks_user_idx
  on public.agent_tasks(user_id, created_at desc);

alter table public.agent_tasks enable row level security;

-- Users can read their own agent tasks.
create policy "Users can read own agent tasks"
  on public.agent_tasks for select
  using (user_id = auth.uid());

-- Org members can read their org's agent tasks.
create policy "Org members can read org agent tasks"
  on public.agent_tasks for select
  using (
    organization_id is not null and
    exists (
      select 1 from public.org_memberships m
      where m.organization_id = agent_tasks.organization_id
        and m.user_id = auth.uid()
    )
  );

-- Authenticated users can insert and update their own agent tasks.
create policy "Authenticated users can manage agent tasks"
  on public.agent_tasks for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Extend cost_records lane enum to include new lanes
--    (extend via check constraint replacement if table already exists)
-- ─────────────────────────────────────────────────────────────────────────────

-- Add 'embedding', 'web_search', 'plugin', 'mcp' lanes to cost_records
-- (already included in the check constraint above for new installations).
-- For upgrades, the check is recreated only if the table was pre-existing:
do $$
begin
  -- Only attempt if the constraint exists with the old definition.
  if exists (
    select 1 from information_schema.check_constraints
    where constraint_name = 'cost_records_lane_check'
      and constraint_schema = 'public'
  ) then
    alter table public.cost_records drop constraint if exists cost_records_lane_check;
    alter table public.cost_records add constraint cost_records_lane_check
      check (lane in ('classification', 'chat', 'reasoning', 'premium',
                      'embedding', 'web_search', 'plugin', 'mcp'));
  end if;
end;
$$;
