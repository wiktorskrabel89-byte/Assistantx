-- Ruflo/Swarm self-learning dataset scaffold.

create table if not exists public.training_trajectories (
  id              uuid primary key default gen_random_uuid(),
  execution_id    uuid not null,
  workflow_id     text not null,
  stage           text not null,
  attempt         integer not null check (attempt > 0),
  success         boolean not null,
  score           smallint,
  user_id         uuid references auth.users(id) on delete set null,
  organization_id uuid references public.organizations(id) on delete set null,
  source          text not null check (source in ('runtime', 'worker', 'mcp')),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists training_trajectories_exec_idx
  on public.training_trajectories (execution_id, created_at desc);

create index if not exists training_trajectories_user_idx
  on public.training_trajectories (user_id, created_at desc);

create index if not exists training_trajectories_org_idx
  on public.training_trajectories (organization_id, created_at desc);

alter table public.training_trajectories enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'training_trajectories'
      and policyname = 'training_trajectories_select_own'
  ) then
    create policy training_trajectories_select_own on public.training_trajectories
      for select using (
        auth.uid() = user_id
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'training_trajectories'
      and policyname = 'training_trajectories_insert'
  ) then
    create policy training_trajectories_insert on public.training_trajectories
      for insert with check (auth.uid() = user_id or user_id is null);
  end if;
end
$$;

