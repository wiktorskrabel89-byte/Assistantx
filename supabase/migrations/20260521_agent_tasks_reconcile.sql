-- Reconcile agent_tasks schema drift between 20260511 and 20260512 migrations.
--
-- Background:
--   20260511_phase2_runtime_tables.sql creates agent_tasks first, with:
--     id uuid PRIMARY KEY, execution_id uuid, workflow_id text, started_at timestamptz
--   20260512_phase2_approvals_costs.sql also CREATE TABLE IF NOT EXISTS, which
--     is a no-op on live instances — so the 20260511 schema is the one on disk.
--
--   The TypeScript runtime layer (insertAgentTask / updateAgentTask) uses:
--     task_id text, execution_id text
--   — columns that exist in the 20260512 definition but NOT in 20260511.
--
-- This migration adds the missing columns and widens the status/role check
-- constraints to match what the TypeScript code writes.

-- ── Step 1: add task_id if absent ────────────────────────────────────────────
alter table public.agent_tasks
  add column if not exists task_id text;

-- Populate task_id from id (uuid → text) for rows that predate this migration.
update public.agent_tasks
  set task_id = id::text
  where task_id is null;

-- Make task_id non-null so the TypeScript .eq("task_id", ...) filter is safe.
alter table public.agent_tasks
  alter column task_id set not null;

-- Unique index acts as a functional primary key for the TypeScript layer.
create unique index if not exists agent_tasks_task_id_uniq
  on public.agent_tasks (task_id);

-- ── Step 2: widen status check constraint ────────────────────────────────────
-- 20260511 only allowed: queued, running, waiting_for_approval, completed, failed
-- TypeScript code also writes: cancelled, retrying, expired
alter table public.agent_tasks
  drop constraint if exists agent_tasks_status_check;

alter table public.agent_tasks
  add constraint agent_tasks_status_check
  check (status in (
    'queued', 'running', 'waiting_for_approval',
    'completed', 'failed', 'cancelled', 'retrying', 'expired'
  ));

-- ── Step 3: add role check if absent ─────────────────────────────────────────
-- 20260511 has no check on role; 20260512 restricts to known agent roles.
alter table public.agent_tasks
  drop constraint if exists agent_tasks_role_check;

alter table public.agent_tasks
  add constraint agent_tasks_role_check
  check (role in ('planner', 'coordinator', 'researcher', 'coder', 'verifier'));

-- ── Step 4: ensure user_id has cascade delete (matches 20260512) ─────────────
-- 20260511 uses on delete set null; 20260512 uses on delete cascade.
-- Keeping set null to avoid data loss on user deletion — no change needed.

-- ── Step 5: additional indexes for the task_id query pattern ─────────────────
create index if not exists agent_tasks_user_created_idx
  on public.agent_tasks (user_id, created_at desc);
