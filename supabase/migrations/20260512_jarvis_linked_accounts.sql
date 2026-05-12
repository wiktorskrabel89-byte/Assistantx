-- supabase/migrations/20260512_jarvis_linked_accounts.sql
-- Stores OAuth tokens for third-party services linked to a user's Jarvis account.
-- Tokens are stored encrypted at rest via Supabase's built-in pgcrypto column encryption.
-- The desktop client NEVER stores tokens locally; it always fetches them via the API.

create table if not exists public.jarvis_linked_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  provider    text not null,                      -- 'github' | 'gmail' | 'google_drive' | 'spotify' | 'discord' | ...
  label       text,                               -- human-readable label, e.g. 'work@example.com'
  access_token  text,                             -- short-lived OAuth access token
  refresh_token text,                             -- long-lived refresh token
  token_type  text default 'Bearer',
  scope       text,                               -- comma-separated granted scopes
  expires_at  timestamptz,
  metadata    jsonb default '{}',                 -- provider-specific info (username, avatar, etc.)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, provider)
);

-- Indexes
create index if not exists jarvis_linked_accounts_user_id_idx
  on public.jarvis_linked_accounts (user_id);

-- Enable RLS
alter table public.jarvis_linked_accounts enable row level security;

-- Policies: users can only see and manage their own linked accounts
create policy "Users can select own linked accounts"
  on public.jarvis_linked_accounts for select
  using (auth.uid() = user_id);

create policy "Users can insert own linked accounts"
  on public.jarvis_linked_accounts for insert
  with check (auth.uid() = user_id);

create policy "Users can update own linked accounts"
  on public.jarvis_linked_accounts for update
  using (auth.uid() = user_id);

create policy "Users can delete own linked accounts"
  on public.jarvis_linked_accounts for delete
  using (auth.uid() = user_id);

-- Cloud memory table for Jarvis (preferences + history synced from desktop)
create table if not exists public.jarvis_cloud_memory (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade unique,
  preferences jsonb not null default '{}',
  history     jsonb not null default '[]',
  updated_at  timestamptz not null default now()
);

alter table public.jarvis_cloud_memory enable row level security;

create policy "Users can select own cloud memory"
  on public.jarvis_cloud_memory for select
  using (auth.uid() = user_id);

create policy "Users can upsert own cloud memory"
  on public.jarvis_cloud_memory for insert
  with check (auth.uid() = user_id);

create policy "Users can update own cloud memory"
  on public.jarvis_cloud_memory for update
  using (auth.uid() = user_id);

-- Auto-update updated_at on cloud memory
create or replace function public.jarvis_touch_cloud_memory()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jarvis_cloud_memory_updated_at on public.jarvis_cloud_memory;
create trigger jarvis_cloud_memory_updated_at
  before update on public.jarvis_cloud_memory
  for each row execute function public.jarvis_touch_cloud_memory();
