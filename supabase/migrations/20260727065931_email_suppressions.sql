-- Email suppression list: any address in here is skipped by launch sends.
-- Written by /api/waitlist/unsubscribe with the service-role client; RLS
-- on with no policies, so anon/authenticated can neither read nor write.

create table if not exists public.email_suppressions (
  email        text primary key,
  reason       text not null default 'unsubscribe',   -- 'unsubscribe' | 'bounce' | 'complaint'
  at           timestamptz not null default timezone('utc', now()),
  ip_hash      text null,
  user_agent   text null
);

alter table public.email_suppressions enable row level security;

create index if not exists email_suppressions_at_idx
  on public.email_suppressions (at desc);
