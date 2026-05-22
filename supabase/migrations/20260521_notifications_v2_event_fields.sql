-- Extend the notifications table with event-sourced metadata fields.
--
-- All new columns are nullable so existing rows and code continue to work
-- without a backfill.  The dedup_key column is the idempotency anchor: the
-- Inngest event handler writes (userId, dedup_key) = (userId,
-- executionId+eventType) and the unique partial index silently absorbs any
-- duplicate on Inngest retry.
--
-- Delivery model (cloud-first, multi-tenant):
--   source        → who emitted the event ('inngest' | 'runtime-facade' | 'worker')
--   execution_id  → workflow_runs.execution_id — enables deep-link to run detail
--   task_id       → agent_tasks.task_id — links to sub-task detail
--   deep_link     → relative URL for the UI to navigate to the run/task
--   metadata      → arbitrary structured context (workflow name, error, etc.)
--   speech_text   → short TTS string rendered client-side by the browser/desktop
--   dedup_key     → executionId:eventType — prevents duplicate rows on retry

alter table public.notifications
  add column if not exists source        text,
  add column if not exists execution_id  text,
  add column if not exists task_id       text,
  add column if not exists deep_link     text,
  add column if not exists metadata      jsonb not null default '{}'::jsonb,
  add column if not exists speech_text   text,
  add column if not exists dedup_key     text;

-- ── Deduplication index ───────────────────────────────────────────────────────
-- Partial unique index: only covers rows where dedup_key is set.
-- Rows without a dedup_key (legacy or informational) are unaffected.
create unique index if not exists notifications_dedup_key_idx
  on public.notifications (user_id, dedup_key)
  where dedup_key is not null;

-- ── Fast lookup by execution_id ───────────────────────────────────────────────
create index if not exists notifications_execution_id_idx
  on public.notifications (execution_id)
  where execution_id is not null;
