-- Phase 1 Foundation Hardening: idempotency keys, execution checkpoints,
-- context compression cache, is_org_member/is_org_admin search_path fix

-- ────────────────────────────────────────────────────────────────────
-- Fix SECURITY DEFINER function search paths (prevent search_path hijacking)
-- ────────────────────────────────────────────────────────────────────

create or replace function public.is_org_member(org_id uuid)
returns boolean
language sql security definer stable
set search_path = public, auth
as $$
  select exists (
    select 1 from public.org_memberships
    where organization_id = org_id and user_id = auth.uid()
  );
$$;

create or replace function public.is_org_admin(org_id uuid)
returns boolean
language sql security definer stable
set search_path = public, auth
as $$
  select exists (
    select 1 from public.org_memberships
    where organization_id = org_id
      and user_id = auth.uid()
      and role in ('owner', 'admin')
  );
$$;

-- ────────────────────────────────────────────────────────────────────
-- Execution checkpoints (idempotency + step snapshots)
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.execution_checkpoints (
  id                uuid primary key default gen_random_uuid(),
  idempotency_key   text not null unique,
  execution_id      uuid not null,
  result            jsonb not null default '{}'::jsonb,
  expires_at        timestamptz not null,
  created_at        timestamptz not null default timezone('utc', now())
);

create index if not exists execution_checkpoints_exec_idx
  on public.execution_checkpoints (execution_id);
create index if not exists execution_checkpoints_expiry_idx
  on public.execution_checkpoints (expires_at);

-- Auto-delete expired checkpoints via a scheduled job or trigger.
-- For now, the application layer will skip expired entries.

alter table public.execution_checkpoints enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'execution_checkpoints'
      and policyname = 'checkpoints_insert'
  ) then
    create policy checkpoints_insert on public.execution_checkpoints
      for insert with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'execution_checkpoints'
      and policyname = 'checkpoints_select'
  ) then
    create policy checkpoints_select on public.execution_checkpoints
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'execution_checkpoints'
      and policyname = 'checkpoints_update'
  ) then
    create policy checkpoints_update on public.execution_checkpoints
      for update using (true);
  end if;
end
$$;

-- ────────────────────────────────────────────────────────────────────
-- Context compression cache (avoid re-compressing identical content)
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.context_compression_cache (
  id            uuid primary key default gen_random_uuid(),
  content_hash  text not null unique,
  compressed    text not null,
  original_len  integer not null,
  compressed_len integer not null,
  strategy      text not null default 'key_sentences',
  created_at    timestamptz not null default timezone('utc', now()),
  last_used_at  timestamptz not null default timezone('utc', now())
);

create index if not exists context_compression_hash_idx
  on public.context_compression_cache (content_hash);

alter table public.context_compression_cache enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'context_compression_cache'
      and policyname = 'compression_cache_all'
  ) then
    create policy compression_cache_all on public.context_compression_cache
      for all using (true);
  end if;
end
$$;

-- ────────────────────────────────────────────────────────────────────
-- Workflow run status enum extension
-- The existing workflow_runs table uses a CHECK constraint on the
-- status column.  Add 'cancelled', 'retrying', 'expired' to match
-- the runtime state machine.
-- ────────────────────────────────────────────────────────────────────

do $$
begin
  -- Drop and recreate the check constraint with the extended set of values.
  -- We use a safe DO block to handle the case where it already matches.
  alter table public.workflow_runs
    drop constraint if exists workflow_runs_status_check;

  alter table public.workflow_runs
    add constraint workflow_runs_status_check
    check (status in (
      'queued', 'running', 'waiting_for_approval',
      'completed', 'failed', 'cancelled', 'retrying', 'expired'
    ));

  -- Same extension for agent_tasks.
  alter table public.agent_tasks
    drop constraint if exists agent_tasks_status_check;

  alter table public.agent_tasks
    add constraint agent_tasks_status_check
    check (status in (
      'queued', 'running', 'waiting_for_approval',
      'completed', 'failed', 'cancelled', 'retrying', 'expired'
    ));
exception
  when others then
    -- Constraint may not exist on older schemas; ignore.
    null;
end
$$;

-- ────────────────────────────────────────────────────────────────────
-- Runtime events: add 'agent_id' column for multi-agent tracing
-- ────────────────────────────────────────────────────────────────────

alter table public.runtime_events
  add column if not exists agent_id text;

-- ────────────────────────────────────────────────────────────────────
-- Tool calls: add 'idempotency_key' for deduplication support
-- ────────────────────────────────────────────────────────────────────

alter table public.tool_calls
  add column if not exists idempotency_key text;
