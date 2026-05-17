-- Jarvis cloud sync: optional reminder payload support.
-- Local desktop remains source of truth; this column enables optional sync.

alter table public.jarvis_cloud_memory
  add column if not exists reminders jsonb not null default '[]'::jsonb;

