alter table public.ai_tasks
  add column if not exists approval_required boolean not null default false,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists approval_at timestamptz,
  add column if not exists approval_decision text
    check (approval_decision in ('approved', 'rejected'));

do $$
begin
  alter table public.ai_tasks
    drop constraint if exists ai_tasks_status_check;

  alter table public.ai_tasks
    add constraint ai_tasks_status_check
    check (status in ('pending', 'pending_approval', 'approved', 'rejected', 'processing', 'completed', 'failed', 'cancelled'));
exception
  when others then
    null;
end
$$;

create index if not exists ai_tasks_user_pending_approval_idx
  on public.ai_tasks (user_id, status, created_at desc)
  where status = 'pending_approval';

create or replace function public.approve_ai_task(
  p_task_id text,
  p_user_id uuid,
  p_decision text
)
returns setof public.ai_tasks
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_decision text;
  updated_row public.ai_tasks%rowtype;
begin
  normalized_decision := lower(trim(coalesce(p_decision, '')));
  if normalized_decision not in ('approved', 'rejected') then
    raise exception 'invalid approval decision: %', p_decision;
  end if;

  update public.ai_tasks as task
  set
    status = normalized_decision,
    approval_required = true,
    approval_decision = normalized_decision,
    approved_by = p_user_id,
    approval_at = timezone('utc', now()),
    completed_at = case
      when normalized_decision = 'rejected' then timezone('utc', now())
      else task.completed_at
    end,
    error = case
      when normalized_decision = 'rejected' then coalesce(task.error, 'Task approval rejected by user.')
      else task.error
    end
  where task.task_id = p_task_id
    and task.user_id = p_user_id
    and task.status = 'pending_approval'
  returning task.* into updated_row;

  if updated_row.task_id is null then
    return;
  end if;

  return next updated_row;
end;
$$;

revoke all on function public.approve_ai_task(text, uuid, text) from public;
revoke all on function public.approve_ai_task(text, uuid, text) from anon;
grant execute on function public.approve_ai_task(text, uuid, text) to authenticated;
grant execute on function public.approve_ai_task(text, uuid, text) to service_role;
