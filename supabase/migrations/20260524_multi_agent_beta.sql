-- Multi-Agent Beta feature:
-- 1. Add opt-in flag to user profiles
-- 2. Add agent pipeline tracking columns to ai_tasks

alter table public.profiles
  add column if not exists multi_agent_beta boolean not null default false;

alter table public.ai_tasks
  add column if not exists agent_loop_status varchar(50) not null default 'idle',
  add column if not exists agent_logs text;

do $$
begin
  alter table public.ai_tasks
    drop constraint if exists ai_tasks_agent_loop_status_check;

  alter table public.ai_tasks
    add constraint ai_tasks_agent_loop_status_check
    check (agent_loop_status in ('idle', 'architect', 'coder', 'tester', 'security', 'done'));
exception
  when others then
    null;
end
$$;

create index if not exists ai_tasks_agent_loop_status_idx
  on public.ai_tasks(agent_loop_status);
