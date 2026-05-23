-- Free vs Premium MVP on existing ai_tasks table:
-- - Free => direct execution
-- - Pro/Pro+ => optional multi-agent pipeline
-- - Deployment-like premium tasks require manual approval before execution

alter table public.ai_tasks
  add column if not exists server_id uuid references public.devices(id) on delete set null,
  add column if not exists task_type text not null default 'ai_request',
  add column if not exists output text,
  add column if not exists execution_mode text not null default 'direct',
  add column if not exists is_agent_generated boolean not null default false;

do $$
begin
  alter table public.ai_tasks
    drop constraint if exists ai_tasks_task_type_check;
  alter table public.ai_tasks
    add constraint ai_tasks_task_type_check
    check (task_type in ('ai_request', 'sysops_command', 'deploy_request'));

  alter table public.ai_tasks
    drop constraint if exists ai_tasks_execution_mode_check;
  alter table public.ai_tasks
    add constraint ai_tasks_execution_mode_check
    check (execution_mode in ('direct', 'multi_agent'));
exception
  when others then
    null;
end
$$;

update public.ai_tasks
set task_type = case
  when category = 'system_action' then 'sysops_command'
  when prompt ~* '\m(deploy|release|rollout|prod|production|wdroż|wdróż)\M' then 'deploy_request'
  else 'ai_request'
end
where task_type is null
   or task_type not in ('ai_request', 'sysops_command', 'deploy_request');

update public.ai_tasks
set execution_mode = case
  when coalesce(agent_loop_status, 'idle') <> 'idle' then 'multi_agent'
  else 'direct'
end
where execution_mode is null
   or execution_mode not in ('direct', 'multi_agent');

update public.ai_tasks
set is_agent_generated = (execution_mode = 'multi_agent')
where is_agent_generated is distinct from (execution_mode = 'multi_agent');

create index if not exists ai_tasks_execution_mode_status_created_idx
  on public.ai_tasks(execution_mode, status, created_at);

create index if not exists ai_tasks_task_type_status_created_idx
  on public.ai_tasks(task_type, status, created_at);

create index if not exists ai_tasks_server_status_created_idx
  on public.ai_tasks(server_id, status, created_at);

alter table public.profiles
  alter column max_cloud_agent_per_day set default 20;

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
    where status in ('pending', 'approved')
      and routing = 'local'
      and (
        (p_target_device_id is null and device_id is null)
        or (p_target_device_id is not null and device_id = p_target_device_id)
        or (p_target_device_id is not null and p_include_unassigned and device_id is null)
      )
    order by case when status = 'approved' then 0 else 1 end, created_at asc
    limit 1
    for update skip locked
  )
  update public.ai_tasks as task
  set
    status = 'processing',
    started_at = timezone('utc', now()),
    routing = case
      when p_route_to_cloud and task.status = 'pending' then 'cloud'
      else task.routing
    end,
    fallback_reason = case
      when p_route_to_cloud and task.status = 'pending' then coalesce(p_fallback_reason, 'cloud_fallback')
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
