create or replace function public.set_workspace_states_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.workspace_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.workspace_states enable row level security;

drop trigger if exists set_workspace_states_updated_at on public.workspace_states;
create trigger set_workspace_states_updated_at
before update on public.workspace_states
for each row
execute function public.set_workspace_states_updated_at();

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_states'
      and policyname = 'workspace_states_select_own'
  ) then
    create policy workspace_states_select_own
      on public.workspace_states
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_states'
      and policyname = 'workspace_states_insert_own'
  ) then
    create policy workspace_states_insert_own
      on public.workspace_states
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'workspace_states'
      and policyname = 'workspace_states_update_own'
  ) then
    create policy workspace_states_update_own
      on public.workspace_states
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'chat_history'
  ) then
    alter table public.chat_history
      add column if not exists user_id uuid references auth.users(id) on delete cascade;

    create index if not exists chat_history_user_id_created_at_idx
      on public.chat_history (user_id, created_at desc);

    alter table public.chat_history enable row level security;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'chat_history'
        and policyname = 'chat_history_select_own'
    ) then
      create policy chat_history_select_own
        on public.chat_history
        for select
        using (auth.uid() = user_id);
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'chat_history'
        and policyname = 'chat_history_insert_own'
    ) then
      create policy chat_history_insert_own
        on public.chat_history
        for insert
        with check (auth.uid() = user_id);
    end if;

    if not exists (
      select 1
      from pg_policies
      where schemaname = 'public'
        and tablename = 'chat_history'
        and policyname = 'chat_history_delete_own'
    ) then
      create policy chat_history_delete_own
        on public.chat_history
        for delete
        using (auth.uid() = user_id);
    end if;
  end if;
end
$$;