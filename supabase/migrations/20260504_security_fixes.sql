-- Security hardening migration.
--
-- 1. public_templates: replace the overly-broad UPDATE policy (which allowed
--    any authenticated user to modify *all* columns) with a SECURITY DEFINER
--    function that performs an atomic upvote increment.
--
-- 2. notifications: restrict the UPDATE policy so users can only flip the
--    `read` flag — not modify title, body, or kind.
--
-- 3. get_user_message_stats: efficient aggregating RPC used by GET /api/stats
--    to avoid a two-step conversation-ID fetch + IN() query.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. public_templates — atomic upvote via SECURITY DEFINER RPC
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the old overly-permissive UPDATE policy that allowed modifying any column.
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'public_templates'
      and policyname = 'public_templates_upvote'
  ) then
    drop policy public_templates_upvote on public.public_templates;
  end if;
end
$$;

-- Add an owner-only UPDATE policy so owners can still edit their own templates.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'public_templates'
      and policyname = 'public_templates_update_own'
  ) then
    create policy public_templates_update_own on public.public_templates
      for update
      using  (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

-- SECURITY DEFINER function: atomically increments upvotes for the given
-- template.  Runs as the function owner (superuser / postgres role) so it can
-- bypass RLS and perform a single atomic UPDATE, avoiding the
-- read-then-write race condition in the old route handler.
create or replace function public.increment_template_upvotes(template_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public_templates
     set upvotes = upvotes + 1
   where id = template_id;
$$;

-- Grant execute to authenticated and anon roles so the API route can call it.
grant execute on function public.increment_template_upvotes(uuid) to authenticated;
grant execute on function public.increment_template_upvotes(uuid) to anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. notifications — restrict UPDATE to the `read` column only
-- ─────────────────────────────────────────────────────────────────────────────

-- Drop the existing policy (allows updating any column).
do $$
begin
  if exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename  = 'notifications'
      and policyname = 'notifications_update_own'
  ) then
    drop policy notifications_update_own on public.notifications;
  end if;
end
$$;

-- Revoke broad UPDATE privilege and grant only the `read` column.
revoke update on public.notifications from authenticated;
grant  update (read) on public.notifications to authenticated;

-- Re-create the UPDATE policy; column-level grant above enforces the column
-- restriction so this policy only needs to check row ownership.
create policy notifications_update_own on public.notifications
  for update
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Efficient user message stats — avoids N+1 / unbounded IN() in API route
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns the count and total token usage for all user-role messages that
-- belong to conversations owned by the given user, in a single server-side join.
create or replace function public.get_user_message_stats(p_user_id uuid)
returns table(total_messages bigint, total_tokens bigint)
language sql
security definer
set search_path = public
as $$
  select
    count(m.id)                                    as total_messages,
    coalesce(sum(m.token_count), 0)::bigint        as total_tokens
  from messages m
  join conversations c on c.id = m.conversation_id
  where c.user_id = p_user_id
    and m.role    = 'user';
$$;

grant execute on function public.get_user_message_stats(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Stripe customer ID → user ID lookup (avoids listUsers() scan in webhook)
-- ─────────────────────────────────────────────────────────────────────────────

-- Returns the Supabase user ID whose app_metadata contains the given Stripe
-- customer ID.  Called by the webhook handler when session.metadata.userId
-- is not set (e.g. legacy subscription events).
create or replace function public.get_user_id_by_stripe_customer(p_customer_id text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id
    from auth.users
   where raw_app_meta_data->>'stripe_customer_id' = p_customer_id
   limit 1;
$$;

grant execute on function public.get_user_id_by_stripe_customer(text) to service_role;

-- Narrow email-based lookup: used as a last-resort fallback in resolveUserId
-- for legacy accounts that do not yet have a stripe_customer_id mapping.
create or replace function public.get_user_id_by_email(p_email text)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select id
    from auth.users
   where email = p_email
   limit 1;
$$;

grant execute on function public.get_user_id_by_email(text) to service_role;
