-- Bidirectional Jarvis ↔ Web sync metadata and scoped payload support.

alter table public.workspace_states
  add column if not exists sync_metadata jsonb not null default '{}'::jsonb;

alter table public.jarvis_cloud_memory
  add column if not exists tasks jsonb not null default '[]'::jsonb,
  add column if not exists schedules jsonb not null default '[]'::jsonb,
  add column if not exists voice_settings jsonb not null default '{}'::jsonb,
  add column if not exists sync_metadata jsonb not null default '{}'::jsonb,
  add column if not exists schema_version integer not null default 1,
  add column if not exists last_source text not null default 'unknown';

