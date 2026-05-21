alter table public.user_profiles
  add column if not exists is_beta_tester boolean not null default false;

alter table public.devices
  add column if not exists uses_vpn boolean not null default false;

alter table public.ai_tasks
  add column if not exists category text not null default 'ai_request'
    check (category in ('ai_request', 'system_action')),
  add column if not exists action_type text,
  add column if not exists payload jsonb not null default '{}'::jsonb,
  add column if not exists device_id uuid references public.devices(id) on delete set null,
  add column if not exists priority integer not null default 100
    check (priority >= 0 and priority <= 1000);

do $$
begin
  alter table public.ai_tasks
    drop constraint if exists ai_tasks_category_device_check;

  alter table public.ai_tasks
    add constraint ai_tasks_category_device_check
    check (
      category = 'ai_request'
      or (
        category = 'system_action'
        and action_type is not null
        and device_id is not null
      )
    );
exception
  when others then
    null;
end
$$;

create index if not exists ai_tasks_status_routing_category_created_idx
  on public.ai_tasks(status, routing, category, created_at);

create index if not exists ai_tasks_device_status_created_idx
  on public.ai_tasks(device_id, status, created_at);

do $$
begin
  alter table public.devices
    drop constraint if exists devices_wake_method_last_success_check;

  alter table public.devices
    add constraint devices_wake_method_last_success_check
    check (
      wake_method_last_success is null
      or wake_method_last_success in ('tailscale_direct', 'router_api', 'udp_path_probe', 'ipv6_magic_packet', 'lan_broadcast')
    );
exception
  when others then
    null;
end
$$;

create or replace function public.can_enqueue_system_action(target_device_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.devices
    where id = target_device_id
      and user_id = auth.uid()
      and trust_state = 'trusted'
  );
$$;

drop policy if exists ai_tasks_insert_own on public.ai_tasks;
create policy ai_tasks_insert_own
  on public.ai_tasks
  for insert
  with check (
    auth.uid() = user_id
    and (
      category <> 'system_action'
      or public.can_enqueue_system_action(device_id)
    )
  );
