do $$
begin
  alter table public.devices
    drop constraint if exists devices_wake_method_last_success_check;

  alter table public.devices
    add constraint devices_wake_method_last_success_check
    check (
      wake_method_last_success is null
      or wake_method_last_success in ('udp_path_probe', 'ipv6_magic_packet', 'lan_broadcast')
    );
exception
  when others then
    null;
end
$$;
