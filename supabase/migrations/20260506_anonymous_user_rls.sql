-- Tighten RLS for anonymous (guest) users introduced by signInAnonymously().
--
-- Anonymous users receive the 'authenticated' role from Supabase, so every
-- policy that guards on auth.role() = 'authenticated' now also applies to
-- them.  The tables below already use auth.uid() = user_id which safely scopes
-- rows to the individual user (anonymous or not), so no change is needed
-- there.
--
-- The only policy that needs tightening is public_templates_insert_auth:
-- anonymous/guest users should NOT be able to publish permanent public
-- templates.  Only real (non-anonymous) accounts should be able to publish.

do $$
begin
  -- Drop and replace the existing insert policy so it explicitly excludes
  -- anonymous sessions.  (auth.jwt() ->> 'is_anonymous') is 'true' for users
  -- created via signInAnonymously(), and NULL / absent for regular accounts.
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'public_templates'
      and policyname = 'public_templates_insert_auth'
  ) then
    drop policy public_templates_insert_auth on public.public_templates;
  end if;

  create policy public_templates_insert_auth on public.public_templates
    for insert
    with check (
      auth.uid() = user_id
      and coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false
    );
end
$$;
