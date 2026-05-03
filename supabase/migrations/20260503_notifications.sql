-- Notifications table for the in-app notification center.
-- Rows are inserted by server-side code (using the service role); users can
-- only read and mark their own notifications as read.

create table if not exists public.notifications (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references auth.users(id) on delete cascade,
  kind        text        not null default 'info',   -- 'info' | 'success' | 'warning'
  title       text        not null,
  body        text        not null default '',
  read        boolean     not null default false,
  created_at  timestamptz not null default timezone('utc', now())
);

alter table public.notifications enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_select_own'
  ) then
    create policy notifications_select_own on public.notifications
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'notifications' and policyname = 'notifications_update_own'
  ) then
    create policy notifications_update_own on public.notifications
      for update using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

create index if not exists notifications_user_id_created_at_idx
  on public.notifications (user_id, created_at desc);

create index if not exists notifications_user_id_unread_idx
  on public.notifications (user_id, read)
  where read = false;
