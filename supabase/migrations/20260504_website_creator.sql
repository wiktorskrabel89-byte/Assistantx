-- Website Creator — per-user project storage
--
-- Creates the `website_creator_projects` table with RLS policies so each user
-- can only access their own projects.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Table
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.website_creator_projects (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null default 'Nowy projekt',
  html                  text not null default '',
  css                   text not null default '',
  js                    text not null default '',
  northflank_service_id text,
  cloudflare_record_id  text,
  live_url              text,
  -- status: draft | deploying | live | error
  status                text not null default 'draft'
    check (status in ('draft', 'deploying', 'live', 'error')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Index for fast per-user lookups (most common query pattern)
create index if not exists website_creator_projects_user_id_idx
  on public.website_creator_projects(user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Row-level security
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.website_creator_projects enable row level security;

-- SELECT: users can read only their own projects
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'website_creator_projects'
      and policyname = 'website_creator_projects_select_own'
  ) then
    create policy website_creator_projects_select_own
      on public.website_creator_projects
      for select
      using (auth.uid() = user_id);
  end if;
end
$$;

-- INSERT: users can insert only rows where user_id matches their own UID
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'website_creator_projects'
      and policyname = 'website_creator_projects_insert_own'
  ) then
    create policy website_creator_projects_insert_own
      on public.website_creator_projects
      for insert
      with check (auth.uid() = user_id);
  end if;
end
$$;

-- UPDATE: users can update only their own rows
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'website_creator_projects'
      and policyname = 'website_creator_projects_update_own'
  ) then
    create policy website_creator_projects_update_own
      on public.website_creator_projects
      for update
      using  (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

-- DELETE: users can delete only their own rows
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'website_creator_projects'
      and policyname = 'website_creator_projects_delete_own'
  ) then
    create policy website_creator_projects_delete_own
      on public.website_creator_projects
      for delete
      using (auth.uid() = user_id);
  end if;
end
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Automatic updated_at trigger
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.website_creator_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists website_creator_projects_updated_at on public.website_creator_projects;

create trigger website_creator_projects_updated_at
  before update on public.website_creator_projects
  for each row
  execute function public.website_creator_set_updated_at();
