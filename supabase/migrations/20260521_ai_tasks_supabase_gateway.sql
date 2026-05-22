alter table public.ai_tasks
  add column if not exists category text not null default 'ai_request'
    check (category in ('ai_request', 'system_action'));

alter table public.ai_tasks
  add column if not exists action_type text;

alter table public.ai_tasks
  add column if not exists payload jsonb not null default '{}'::jsonb;

alter table public.ai_tasks
  add column if not exists device_id uuid references public.devices(id) on delete set null;

create index if not exists ai_tasks_pending_local_created_idx
  on public.ai_tasks (created_at)
  where status = 'pending' and routing = 'local';

create index if not exists ai_tasks_user_status_created_idx
  on public.ai_tasks (user_id, status, created_at desc);

alter table public.ai_tasks force row level security;

do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_tasks'
      and policyname = 'ai_tasks_select_own'
  ) then
    execute $policy$
      alter policy ai_tasks_select_own
      on public.ai_tasks
      using ((select auth.uid()) = user_id)
    $policy$;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_tasks'
      and policyname = 'ai_tasks_insert_own'
  ) then
    execute $policy$
      alter policy ai_tasks_insert_own
      on public.ai_tasks
      with check ((select auth.uid()) = user_id)
    $policy$;
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'ai_tasks'
      and policyname = 'ai_tasks_update_own'
  ) then
    execute $policy$
      alter policy ai_tasks_update_own
      on public.ai_tasks
      using ((select auth.uid()) = user_id)
      with check ((select auth.uid()) = user_id)
    $policy$;
  end if;
end
$$;

create or replace function public.claim_next_ai_task(
  p_target_device_id uuid default null,
  p_include_unassigned boolean default true,
  p_route_to_cloud boolean default false,
  p_fallback_reason text default null
)
returns setof public.ai_tasks
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  claimed_row public.ai_tasks%rowtype;
begin
  with next_task as (
    select task_id
    from public.ai_tasks
    where status = 'pending'
      and routing = 'local'
      and (
        (p_target_device_id is null and device_id is null)
        or (p_target_device_id is not null and device_id = p_target_device_id)
        or (p_target_device_id is not null and p_include_unassigned and device_id is null)
      )
    order by created_at asc
    limit 1
    for update skip locked
  )
  update public.ai_tasks as task
  set
    status = 'processing',
    started_at = timezone('utc', now()),
    routing = case
      when p_route_to_cloud then 'cloud'
      else task.routing
    end,
    fallback_reason = case
      when p_route_to_cloud then coalesce(p_fallback_reason, 'cloud_fallback')
      else task.fallback_reason
    end
  from next_task
  where task.task_id = next_task.task_id
  returning task.* into claimed_row;

  if claimed_row.task_id is null then
    return;
  end if;

  return next claimed_row;
end;
$$;

revoke all on function public.claim_next_ai_task(uuid, boolean, boolean, text) from public;
revoke all on function public.claim_next_ai_task(uuid, boolean, boolean, text) from anon;
revoke all on function public.claim_next_ai_task(uuid, boolean, boolean, text) from authenticated;
grant execute on function public.claim_next_ai_task(uuid, boolean, boolean, text) to service_role;
