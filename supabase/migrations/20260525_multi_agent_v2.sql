-- Multi-Agent v2:
-- - Extend pipeline statuses (sandbox, reviewer, critic)
-- - Persist sandbox/critic telemetry on ai_tasks
-- - Add daily cloud quota counters on profiles
-- - Provide atomic quota consumption RPC

alter table public.ai_tasks
  add column if not exists sandbox_ram_mb integer,
  add column if not exists sandbox_boot_ms integer,
  add column if not exists sandbox_passed boolean,
  add column if not exists critic_score smallint,
  add column if not exists agent_attempt integer not null default 1,
  add column if not exists quota_remaining integer,
  add column if not exists quota_max integer,
  add column if not exists token_estimate_k double precision;

do $$
begin
  alter table public.ai_tasks
    drop constraint if exists ai_tasks_critic_score_check;

  alter table public.ai_tasks
    add constraint ai_tasks_critic_score_check
    check (critic_score is null or (critic_score >= 1 and critic_score <= 10));
exception
  when others then
    null;
end
$$;

do $$
begin
  alter table public.ai_tasks
    drop constraint if exists ai_tasks_agent_loop_status_check;

  alter table public.ai_tasks
    add constraint ai_tasks_agent_loop_status_check
    check (
      agent_loop_status in (
        'idle',
        'architect',
        'coder',
        'tester',
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

alter table public.profiles
  add column if not exists cloud_agent_uses_today integer not null default 0,
  add column if not exists max_cloud_agent_per_day integer not null default 5,
  add column if not exists cloud_agent_quota_reset_date date not null default current_date;

do $$
begin
  alter table public.profiles
    drop constraint if exists profiles_cloud_agent_uses_today_non_negative;
  alter table public.profiles
    add constraint profiles_cloud_agent_uses_today_non_negative
    check (cloud_agent_uses_today >= 0);

  alter table public.profiles
    drop constraint if exists profiles_max_cloud_agent_per_day_non_negative;
  alter table public.profiles
    add constraint profiles_max_cloud_agent_per_day_non_negative
    check (max_cloud_agent_per_day >= 0);
exception
  when others then
    null;
end
$$;

create or replace function public.consume_cloud_agent_quota(p_user_id uuid)
returns table (
  allowed boolean,
  uses_today integer,
  max_per_day integer,
  remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.profiles%rowtype;
begin
  update public.profiles
  set
    cloud_agent_uses_today = case
      when cloud_agent_quota_reset_date < current_date then 0
      else cloud_agent_uses_today
    end,
    cloud_agent_quota_reset_date = case
      when cloud_agent_quota_reset_date < current_date then current_date
      else cloud_agent_quota_reset_date
    end
  where id = p_user_id
  returning * into v_row;

  if not found then
    return query select false, 0, 0, 0;
    return;
  end if;

  if v_row.cloud_agent_uses_today >= v_row.max_cloud_agent_per_day then
    return query
      select false,
             v_row.cloud_agent_uses_today,
             v_row.max_cloud_agent_per_day,
             greatest(v_row.max_cloud_agent_per_day - v_row.cloud_agent_uses_today, 0);
    return;
  end if;

  update public.profiles
  set cloud_agent_uses_today = cloud_agent_uses_today + 1
  where id = p_user_id
  returning cloud_agent_uses_today, max_cloud_agent_per_day
  into v_row.cloud_agent_uses_today, v_row.max_cloud_agent_per_day;

  return query
    select true,
           v_row.cloud_agent_uses_today,
           v_row.max_cloud_agent_per_day,
           greatest(v_row.max_cloud_agent_per_day - v_row.cloud_agent_uses_today, 0);
end;
$$;
