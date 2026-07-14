-- Anti-abuse for the public waitlist:
--  * ip_hash column stores only a salted hash of the submitter IP (never the
--    raw IP), so we can rate-limit without holding PII.
--  * waitlist_join() rejects when one ip_hash has already added 8 distinct
--    emails in the last hour (rate_limited=true) — stops someone
--    mass-entering other people's addresses or spamming the list.
--  * Duplicate emails remain a silent no-op (is_duplicate=true) — the same
--    address can never be added twice.

alter table public.waitlist_signups
  add column if not exists ip_hash text;

create index if not exists waitlist_signups_ip_hash_created_idx
  on public.waitlist_signups (ip_hash, created_at);

drop function if exists public.waitlist_join(text, text, text);

create function public.waitlist_join(
  p_email   text,
  p_name    text default null,
  p_source  text default 'landing',
  p_ip_hash text default null
)
returns table(total bigint, is_duplicate boolean, rate_limited boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dup    boolean := false;
  v_recent integer := 0;
  v_limit  constant integer := 8; -- max distinct emails per IP per hour
begin
  if p_ip_hash is not null and length(p_ip_hash) > 0 then
    select count(*) into v_recent
    from public.waitlist_signups
    where ip_hash = p_ip_hash
      and created_at > now() - interval '1 hour';

    if v_recent >= v_limit then
      return query
        select count(*)::bigint, false, true
        from public.waitlist_signups;
      return;
    end if;
  end if;

  insert into public.waitlist_signups(email, name, source, ip_hash)
  values (
    lower(trim(p_email)),
    nullif(trim(p_name), ''),
    coalesce(nullif(trim(p_source), ''), 'landing'),
    p_ip_hash
  )
  on conflict (email) do nothing;

  if not found then
    v_dup := true;
  end if;

  return query
    select count(*)::bigint, v_dup, false
    from public.waitlist_signups;
end;
$$;

revoke all on function public.waitlist_join(text, text, text, text) from public;
grant execute on function public.waitlist_join(text, text, text, text) to anon, authenticated;
