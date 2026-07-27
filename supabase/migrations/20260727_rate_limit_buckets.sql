-- Minute-window rate-limit buckets, used to throttle abuse on public
-- endpoints like /api/analytics/track. Server-only (RLS enabled, no
-- policies).

create table if not exists public.rate_limit_buckets (
  scope         text not null,             -- e.g. 'analytics.track'
  ip_hash       text not null,
  window_start  timestamptz not null,      -- rounded to minute
  count         integer not null default 0,
  primary key (scope, ip_hash, window_start)
);

alter table public.rate_limit_buckets enable row level security;

create index if not exists rate_limit_buckets_window_idx
  on public.rate_limit_buckets (window_start desc);

-- Atomic increment RPC — returns the new count in the current window.
create or replace function public.rate_limit_hit(
  p_scope text,
  p_ip_hash text,
  p_window timestamptz
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
begin
  insert into public.rate_limit_buckets(scope, ip_hash, window_start, count)
  values (p_scope, p_ip_hash, p_window, 1)
  on conflict (scope, ip_hash, window_start) do update
    set count = public.rate_limit_buckets.count + 1
  returning count into v_count;
  return v_count;
end
$$;

grant execute on function public.rate_limit_hit(text, text, timestamptz) to anon, authenticated;
