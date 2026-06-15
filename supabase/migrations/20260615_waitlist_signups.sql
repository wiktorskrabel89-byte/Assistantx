-- Waitlist signups collected from the public /waitlist landing page
-- (assistantx-waitlist subdomain). Writes go through the service-role
-- client in app/api/waitlist/route.ts, so no public RLS policies are needed.

create table if not exists public.waitlist_signups (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  locale      text null,
  source      text null,
  created_at  timestamptz not null default timezone('utc', now())
);

alter table public.waitlist_signups enable row level security;

create index if not exists waitlist_signups_created_at_idx
  on public.waitlist_signups (created_at desc);
