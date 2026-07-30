-- Double opt-in support (behind the WAITLIST_DOUBLE_OPTIN app flag). Adds
-- status/confirm_token/confirmed_at. waitlist_join() gains p_confirm: when true
-- the row is created 'pending' and returns a token to email; when false it
-- behaves as before (row 'confirmed' immediately). Only 'confirmed' rows count
-- toward the returned total, so pending squatters never inflate the number.

alter table public.waitlist_signups
  add column if not exists status        text not null default 'confirmed',
  add column if not exists confirm_token  uuid not null default gen_random_uuid(),
  add column if not exists confirmed_at   timestamptz;

create index if not exists waitlist_signups_confirm_token_idx on public.waitlist_signups (confirm_token);
create index if not exists waitlist_signups_status_idx on public.waitlist_signups (status);

drop function if exists public.waitlist_join(text, text, text, text);

create function public.waitlist_join(
  p_email   text,
  p_name    text default null,
  p_source  text default 'landing',
  p_ip_hash text default null,
  p_confirm boolean default false
)
returns table(total bigint, is_duplicate boolean, already_confirmed boolean, rate_limited boolean, token uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recent integer := 0;
  v_limit  constant integer := 8;
  v_token  uuid;
  v_status text;
begin
  if p_ip_hash is not null and length(p_ip_hash) > 0 then
    select count(*) into v_recent
    from public.waitlist_signups
    where ip_hash = p_ip_hash and created_at > now() - interval '1 hour';
    if v_recent >= v_limit then
      return query select
        (select count(*) from public.waitlist_signups where status = 'confirmed')::bigint,
        false, false, true, null::uuid;
      return;
    end if;
  end if;

  insert into public.waitlist_signups(email, name, source, ip_hash, status, confirmed_at)
  values (
    lower(trim(p_email)),
    nullif(trim(p_name), ''),
    coalesce(nullif(trim(p_source), ''), 'landing'),
    p_ip_hash,
    case when p_confirm then 'pending' else 'confirmed' end,
    case when p_confirm then null else now() end
  )
  on conflict (email) do nothing
  returning confirm_token into v_token;

  if v_token is not null then
    return query select
      (select count(*) from public.waitlist_signups where status = 'confirmed')::bigint,
      false, false, false, v_token;
    return;
  end if;

  select confirm_token, status into v_token, v_status
  from public.waitlist_signups where email = lower(trim(p_email));

  return query select
    (select count(*) from public.waitlist_signups where status = 'confirmed')::bigint,
    true, (v_status = 'confirmed'), false, v_token;
end;
$$;

create or replace function public.waitlist_confirm(p_token uuid)
returns table(ok boolean, already boolean, display_name text, total bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_name   text;
begin
  select status, name into v_status, v_name
  from public.waitlist_signups where confirm_token = p_token;

  if v_status is null then
    return query select false, false, null::text,
      (select count(*) from public.waitlist_signups where status = 'confirmed')::bigint;
    return;
  end if;

  if v_status = 'confirmed' then
    return query select true, true, v_name,
      (select count(*) from public.waitlist_signups where status = 'confirmed')::bigint;
    return;
  end if;

  update public.waitlist_signups
  set status = 'confirmed', confirmed_at = now()
  where confirm_token = p_token;

  return query select true, false, v_name,
    (select count(*) from public.waitlist_signups where status = 'confirmed')::bigint;
end;
$$;

revoke all on function public.waitlist_join(text, text, text, text, boolean) from public;
revoke all on function public.waitlist_confirm(uuid) from public;
grant execute on function public.waitlist_join(text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.waitlist_confirm(uuid) to anon, authenticated;
