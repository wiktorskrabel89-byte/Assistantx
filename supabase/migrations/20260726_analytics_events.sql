-- Analytics events — general-purpose product event stream.
--
-- Written by server-side code with the service-role client (see
-- app/lib/analytics-events.ts). RLS is enabled with no policies, so anon
-- and authenticated roles cannot read or write.
--
-- Anyone (signed-in or not) may fire events through /api/analytics/track;
-- that route validates + inserts. If we ever want the client to hit this
-- table directly we can layer a "insert-only for authenticated" policy on
-- top later.

create table if not exists public.analytics_events (
  id            bigserial primary key,
  event_name    text not null,
  user_id       uuid null references auth.users(id) on delete set null,
  anonymous_id  text null,
  source        text null,          -- 'web' | 'desktop' | 'mobile' | free-form
  properties    jsonb not null default '{}'::jsonb,
  ip_hash       text null,
  user_agent    text null,
  at            timestamptz not null default timezone('utc', now())
);

alter table public.analytics_events enable row level security;

create index if not exists analytics_events_at_idx
  on public.analytics_events (at desc);
create index if not exists analytics_events_event_name_at_idx
  on public.analytics_events (event_name, at desc);
create index if not exists analytics_events_user_id_at_idx
  on public.analytics_events (user_id, at desc)
  where user_id is not null;
