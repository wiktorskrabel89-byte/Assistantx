-- Public prompt-template library.
-- Authenticated users can publish their templates; everyone can browse and
-- upvote them.  Upvotes are stored as a plain integer counter on the row
-- itself (no separate upvote-tracking table for now).

create table if not exists public.public_templates (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        references auth.users(id) on delete set null,
  display_name text        not null default 'Anonymous',
  label        text        not null,
  content      text        not null,
  mode         text        not null default 'chat',
  upvotes      integer     not null default 0,
  created_at   timestamptz not null default timezone('utc', now())
);

alter table public.public_templates enable row level security;

do $$
begin
  -- Everyone can browse
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_templates' and policyname = 'public_templates_select_all'
  ) then
    create policy public_templates_select_all on public.public_templates
      for select using (true);
  end if;

  -- Authenticated users can publish
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_templates' and policyname = 'public_templates_insert_auth'
  ) then
    create policy public_templates_insert_auth on public.public_templates
      for insert with check (auth.uid() = user_id);
  end if;

  -- Owners can delete their own
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_templates' and policyname = 'public_templates_delete_own'
  ) then
    create policy public_templates_delete_own on public.public_templates
      for delete using (auth.uid() = user_id);
  end if;

  -- Any authenticated user can upvote (increments the counter)
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'public_templates' and policyname = 'public_templates_upvote'
  ) then
    create policy public_templates_upvote on public.public_templates
      for update using (auth.role() = 'authenticated')
      with check (auth.role() = 'authenticated');
  end if;
end
$$;

create index if not exists public_templates_upvotes_idx
  on public.public_templates (upvotes desc);

create index if not exists public_templates_created_at_idx
  on public.public_templates (created_at desc);
