alter table public.devices
  add column if not exists hardware_id text,
  add column if not exists bios_manufacturer text,
  add column if not exists bios_model text,
  add column if not exists setup_state text not null default 'pending'
    check (setup_state in ('pending', 'waiting_for_pairing', 'paired', 'ready', 'needs_bios_manual_step', 'error')),
  add column if not exists last_public_ipv6_discovered_at timestamptz,
  add column if not exists last_local_broadcast text;

create index if not exists devices_user_hardware_id_idx
  on public.devices (user_id, hardware_id)
  where hardware_id is not null;

create index if not exists devices_setup_state_idx
  on public.devices (setup_state, trust_state);

alter table public.ai_tasks
  add column if not exists device_id uuid references public.devices(id) on delete cascade,
  add column if not exists category text not null default 'assistant'
    check (category in ('assistant', 'system_action')),
  add column if not exists action_type text,
  add column if not exists payload jsonb not null default '{}'::jsonb;

do $$
begin
  alter table public.ai_tasks
    drop constraint if exists ai_tasks_system_action_type_check;

  alter table public.ai_tasks
    add constraint ai_tasks_system_action_type_check
    check (category <> 'system_action' or nullif(trim(coalesce(action_type, '')), '') is not null);
exception
  when others then
    null;
end
$$;

create index if not exists ai_tasks_device_status_created_idx
  on public.ai_tasks(device_id, status, created_at);

drop policy if exists ai_tasks_insert_own on public.ai_tasks;
create policy ai_tasks_insert_own
  on public.ai_tasks
  for insert
  with check (
    auth.uid() = user_id
    and (
      device_id is null
      or exists (
        select 1
        from public.devices d
        where d.id = device_id
          and d.user_id = auth.uid()
      )
    )
  );

drop policy if exists ai_tasks_update_own on public.ai_tasks;
create policy ai_tasks_update_own
  on public.ai_tasks
  for update
  using (
    auth.uid() = user_id
    and (
      device_id is null
      or exists (
        select 1
        from public.devices d
        where d.id = device_id
          and d.user_id = auth.uid()
      )
    )
  )
  with check (
    auth.uid() = user_id
    and (
      device_id is null
      or exists (
        select 1
        from public.devices d
        where d.id = device_id
          and d.user_id = auth.uid()
      )
    )
  );
