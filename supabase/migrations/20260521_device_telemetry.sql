create table if not exists public.device_telemetry (
  device_id uuid primary key references public.devices(id) on delete cascade,
  cpu_percent numeric(5, 2),
  ram_percent numeric(5, 2),
  temperature_celsius numeric(6, 2),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists device_telemetry_updated_idx
  on public.device_telemetry (updated_at desc);

alter table public.device_telemetry enable row level security;

drop policy if exists device_telemetry_select_owner on public.device_telemetry;
create policy device_telemetry_select_owner
  on public.device_telemetry
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.devices d
      where d.id = device_telemetry.device_id
        and d.user_id = auth.uid()
    )
  );
