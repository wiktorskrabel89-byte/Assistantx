create table if not exists public.admin_settings (
  key         text primary key,
  value       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default timezone('utc', now())
);

alter table public.admin_settings enable row level security;

create or replace function public.get_public_setting(p_key text)
returns jsonb
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select value
  from public.admin_settings
  where key = p_key and p_key in ('launch_date')
$$;
grant execute on function public.get_public_setting(text) to anon, authenticated;
