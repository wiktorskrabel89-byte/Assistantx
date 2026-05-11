-- Push subscription storage for web push delivery groundwork.
-- Each row represents one browser/device endpoint for a signed-in user.

create table if not exists public.push_subscriptions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  endpoint         text not null,
  p256dh_key       text not null,
  auth_key         text not null,
  expiration_time  bigint null,
  user_agent       text null,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now()),
  unique (user_id, endpoint)
);

alter table public.push_subscriptions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_subscriptions_select_own'
  ) then
    create policy push_subscriptions_select_own on public.push_subscriptions
      for select using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_subscriptions_insert_own'
  ) then
    create policy push_subscriptions_insert_own on public.push_subscriptions
      for insert with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_subscriptions_update_own'
  ) then
    create policy push_subscriptions_update_own on public.push_subscriptions
      for update using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'push_subscriptions' and policyname = 'push_subscriptions_delete_own'
  ) then
    create policy push_subscriptions_delete_own on public.push_subscriptions
      for delete using (auth.uid() = user_id);
  end if;
end
$$;

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);
