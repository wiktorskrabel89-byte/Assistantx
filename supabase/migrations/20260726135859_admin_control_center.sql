-- Admin control center: session storage, audit trail, launch tracking.
--
-- All three tables are locked with RLS enabled and NO policies, so they are
-- unreachable to the anon/authenticated roles by design. Only the server-side
-- service-role client (used from /api/admin/*) can read or write them.

-- ─────────────────────────────────────────────────────────────
--  admin_sessions
-- ─────────────────────────────────────────────────────────────
create table if not exists public.admin_sessions (
  id           uuid primary key default gen_random_uuid(),
  token_hash   text not null unique,   -- sha256 of the raw cookie token
  created_at   timestamptz not null default timezone('utc', now()),
  expires_at   timestamptz not null,
  ip_hash      text null,              -- optional, sha256(salt:ip)
  user_agent   text null
);

alter table public.admin_sessions enable row level security;
create index if not exists admin_sessions_expires_idx
  on public.admin_sessions (expires_at);

-- ─────────────────────────────────────────────────────────────
--  admin_audit_logs
-- ─────────────────────────────────────────────────────────────
create table if not exists public.admin_audit_logs (
  id           bigserial primary key,
  at           timestamptz not null default timezone('utc', now()),
  actor        text not null default 'admin', -- session id or 'admin'
  action       text not null,                 -- e.g. 'login', 'logout', 'launch.created', 'launch.sent'
  target       text null,                     -- optional object id / email hash
  metadata     jsonb not null default '{}'::jsonb,
  ip_hash      text null,
  user_agent   text null
);

alter table public.admin_audit_logs enable row level security;
create index if not exists admin_audit_logs_at_idx
  on public.admin_audit_logs (at desc);
create index if not exists admin_audit_logs_action_idx
  on public.admin_audit_logs (action);

-- ─────────────────────────────────────────────────────────────
--  admin_launches
-- ─────────────────────────────────────────────────────────────
-- A "launch" is an email blast composed by an admin and delivered via
-- Resend. Recipient tracking columns are counters so we don't have to
-- store every recipient email in a second table for the MVP.
create table if not exists public.admin_launches (
  id                uuid primary key default gen_random_uuid(),
  name              text not null unique,          -- prevents duplicate-send by accident
  subject           text not null,
  body_html         text not null,
  body_text         text null,
  audience          text not null default 'waitlist_confirmed',
  status            text not null default 'draft'  -- draft | scheduled | sending | sent | cancelled | failed
    check (status in ('draft','scheduled','sending','sent','cancelled','failed')),
  scheduled_for     timestamptz null,
  created_at        timestamptz not null default timezone('utc', now()),
  updated_at        timestamptz not null default timezone('utc', now()),
  sent_at           timestamptz null,
  recipient_total   integer not null default 0,
  recipient_ok      integer not null default 0,
  recipient_failed  integer not null default 0,
  last_error        text null
);

alter table public.admin_launches enable row level security;
create index if not exists admin_launches_status_idx
  on public.admin_launches (status);
create index if not exists admin_launches_scheduled_idx
  on public.admin_launches (scheduled_for)
  where scheduled_for is not null;
