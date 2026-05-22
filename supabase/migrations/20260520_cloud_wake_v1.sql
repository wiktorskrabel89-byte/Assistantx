-- Cloud Wake v1 foundation:
-- - canonical presence states include hibernated/unreachable
-- - wake/network metadata on devices
-- - lightweight wake audit retention helper

alter table public.devices
  add column if not exists last_known_ipv6 inet,
  add column if not exists last_known_mac text,
  add column if not exists last_udp_port integer check (last_udp_port is null or (last_udp_port >= 1 and last_udp_port <= 65535)),
  add column if not exists last_seen_network_epoch bigint,
  add column if not exists wake_method_last_success text
    check (wake_method_last_success is null or wake_method_last_success in ('udp_path_probe', 'ipv6_magic_packet', 'lan_broadcast')),
  add column if not exists wake_fail_count integer not null default 0;

create index if not exists devices_last_known_ipv6_idx
  on public.devices (last_known_ipv6);

create index if not exists devices_wake_method_idx
  on public.devices (wake_method_last_success, wake_fail_count);

do $$
begin
  alter table public.device_presence
    drop constraint if exists device_presence_status_check;

  alter table public.device_presence
    add constraint device_presence_status_check
    check (status in (
      'offline', 'booting', 'online', 'busy', 'gaming', 'sleeping', 'idle',
      'hibernated', 'unreachable'
    ));
exception
  when others then
    null;
end
$$;

create or replace function public.cleanup_wake_audit_logs(retention_days integer default 30)
returns bigint
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_deleted bigint := 0;
  v_days integer := greatest(1, least(retention_days, 90));
begin
  delete from public.audit_logs
  where event_type in ('wake_requested', 'wake_attempt', 'wake_completed', 'wake_failed')
    and created_at < timezone('utc', now()) - make_interval(days => v_days);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

grant execute on function public.cleanup_wake_audit_logs(integer) to authenticated;

