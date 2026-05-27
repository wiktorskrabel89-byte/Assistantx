-- Jarvis Code Suite: align DB constraints with 7-agent business vocabulary.

do $$
begin
  alter table public.ai_tasks
    drop constraint if exists ai_tasks_agent_loop_status_check;

  alter table public.ai_tasks
    add constraint ai_tasks_agent_loop_status_check
    check (
      agent_loop_status in (
        'idle',
        'planner',
        'architect',
        'developer',
        'coder',
        'tester',
        'debugger',
        'devops',
        'release_manager',
        'sandbox',
        'reviewer',
        'critic',
        'security',
        'done'
      )
    );
exception
  when others then
    null;
end
$$;

do $$
begin
  alter table public.agent_tasks
    drop constraint if exists agent_tasks_role_check;

  alter table public.agent_tasks
    add constraint agent_tasks_role_check
    check (
      role in (
        'planner',
        'architect',
        'coordinator',
        'researcher',
        'developer',
        'coder',
        'reviewer',
        'tester',
        'debugger',
        'devops',
        'release_manager',
        'verifier'
      )
    );
exception
  when others then
    null;
end
$$;
