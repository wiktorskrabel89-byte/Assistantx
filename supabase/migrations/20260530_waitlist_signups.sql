-- Public waitlist signups (e.g. assistantx-waitlist.assistantx.pl landing page).
-- Inserts are performed exclusively via the service-role client in
-- app/api/waitlist/route.ts, which bypasses RLS — so no anon/authenticated
-- insert policy is required. RLS is enabled for defense-in-depth and to
-- satisfy Supabase security advisors (no policies = no access via anon/auth roles).

create table if not exists public.waitlist_signups (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null unique,
  language   text,
  source     text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.waitlist_signups enable row level security;

create index if not exists waitlist_signups_created_at_idx
  on public.waitlist_signups (created_at desc);
