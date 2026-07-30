-- One RPC that inserts a waitlist signup and returns the running total in a
-- single call. SECURITY DEFINER so it works with the public anon key the app
-- already ships (no service-role key required) while the table stays fully
-- locked (no RLS policies) — emails are never readable through the API. The
-- function returns only aggregate info (count + duplicate flag).
create or replace function public.waitlist_join(
  p_email  text,
  p_name   text default null,
  p_source text default 'landing'
)
returns table(total bigint, is_duplicate boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dup boolean := false;
begin
  insert into public.waitlist_signups(email, name, source)
  values (lower(trim(p_email)), nullif(trim(p_name), ''), coalesce(nullif(trim(p_source), ''), 'landing'))
  on conflict (email) do nothing;

  if not found then
    v_dup := true;
  end if;

  return query select count(*)::bigint, v_dup from public.waitlist_signups;
end;
$$;

revoke all on function public.waitlist_join(text, text, text) from public;
grant execute on function public.waitlist_join(text, text, text) to anon, authenticated;
