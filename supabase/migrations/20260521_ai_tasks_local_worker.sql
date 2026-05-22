create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  default_temperature double precision not null default 0.0 check (default_temperature >= 0.0 and default_temperature <= 2.0),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.user_profiles enable row level security;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'user_profiles'
      and column_name = 'default_temperature'
      and is_nullable = 'YES'
  ) then
    alter table public.user_profiles
      alter column default_temperature set not null;
  end if;
end
$$;

create or replace function public.set_user_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_user_profiles_updated_at on public.user_profiles;
create trigger set_user_profiles_updated_at
before update on public.user_profiles
for each row
execute function public.set_user_profiles_updated_at();

create or replace function public.ensure_user_profile_row()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.user_profiles (user_id)
  values (new.id)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_profile_created on auth.users;
create trigger on_auth_user_profile_created
after insert on auth.users
for each row
execute function public.ensure_user_profile_row();

create table if not exists public.ai_tasks (
  task_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  response text,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled')),
  routing text not null default 'local'
    check (routing in ('local', 'cloud')),
  provider text,
  model text,
  temperature double precision check (temperature >= 0.0 and temperature <= 2.0),
  fallback_reason text,
  error text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.ai_tasks enable row level security;

create or replace function public.set_ai_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_ai_tasks_updated_at on public.ai_tasks;
create trigger set_ai_tasks_updated_at
before update on public.ai_tasks
for each row
execute function public.set_ai_tasks_updated_at();

create index if not exists ai_tasks_status_routing_created_idx
  on public.ai_tasks(status, routing, created_at);

create index if not exists ai_tasks_user_created_idx
  on public.ai_tasks(user_id, created_at desc);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_select_own'
  ) then
    create policy user_profiles_select_own
      on public.user_profiles
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_insert_own'
  ) then
    create policy user_profiles_insert_own
      on public.user_profiles
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'user_profiles'
      and policyname = 'user_profiles_update_own'
  ) then
    create policy user_profiles_update_own
      on public.user_profiles
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_tasks'
      and policyname = 'ai_tasks_select_own'
  ) then
    create policy ai_tasks_select_own
      on public.ai_tasks
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_tasks'
      and policyname = 'ai_tasks_insert_own'
  ) then
    create policy ai_tasks_insert_own
      on public.ai_tasks
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_tasks'
      and policyname = 'ai_tasks_update_own'
  ) then
    create policy ai_tasks_update_own
      on public.ai_tasks
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;
