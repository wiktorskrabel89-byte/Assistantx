-- Website Creator Enhancements
--
-- 1. Adds `pages` (JSONB) and `preview_url` columns to website_creator_projects.
-- 2. Creates the `website_creator_snapshots` table for per-project version history.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. New columns on existing projects table
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.website_creator_projects
  add column if not exists pages       jsonb not null default '[]'::jsonb,
  add column if not exists preview_url text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Snapshots table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.website_creator_snapshots (
  id         uuid        primary key default gen_random_uuid(),
  project_id uuid        not null
    references public.website_creator_projects(id) on delete cascade,
  user_id    uuid        not null
    references auth.users(id) on delete cascade,
  label      text,
  html       text        not null default '',
  css        text        not null default '',
  js         text        not null default '',
  pages      jsonb       not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

-- Fast lookup: most recent snapshots per project
create index if not exists website_creator_snapshots_project_idx
  on public.website_creator_snapshots(project_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Row-level security for snapshots
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.website_creator_snapshots enable row level security;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'website_creator_snapshots'
      and policyname = 'snaps_select_own'
  ) then
    create policy snaps_select_own
      on public.website_creator_snapshots
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'website_creator_snapshots'
      and policyname = 'snaps_insert_own'
  ) then
    create policy snaps_insert_own
      on public.website_creator_snapshots
      for insert
      with check (auth.uid() = user_id);
  end if;
end $$;

do $$ begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'website_creator_snapshots'
      and policyname = 'snaps_delete_own'
  ) then
    create policy snaps_delete_own
      on public.website_creator_snapshots
      for delete
      using (auth.uid() = user_id);
  end if;
end $$;
