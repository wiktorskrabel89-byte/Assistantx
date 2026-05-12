-- Phase 5: marketplace listings, submissions, ecosystem adapter log

-- ────────────────────────────────────────────────────────────────────
-- Marketplace listings
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.marketplace_listings (
  id              uuid primary key default gen_random_uuid(),
  plugin_id       text not null unique references public.plugin_manifests(plugin_id) on delete cascade,
  trust_level     text not null default 'community' check (trust_level in ('community', 'verified', 'official')),
  category        text not null default 'other',
  downloads       integer not null default 0,
-- check constraint enforces standard 0–5 star range
  rating          numeric(3, 2) not null default 0 check (rating >= 0 and rating <= 5),
  review_count    integer not null default 0,
  listed_at       timestamptz not null default timezone('utc', now()),
  updated_at      timestamptz not null default timezone('utc', now())
);

create index if not exists marketplace_category_idx on public.marketplace_listings (category, downloads desc);
create index if not exists marketplace_trust_idx    on public.marketplace_listings (trust_level, listed_at desc);

-- ────────────────────────────────────────────────────────────────────
-- Marketplace submissions
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.marketplace_submissions (
  id              uuid primary key default gen_random_uuid(),
  plugin_id       text not null,
  submitted_by    uuid references auth.users(id) on delete set null,
  category        text not null default 'other',
  repository_url  text,
  status          text not null default 'pending_review' check (status in ('pending_review', 'approved', 'rejected')),
  review_notes    text,
  reviewed_by     uuid references auth.users(id) on delete set null,
  submitted_at    timestamptz not null default timezone('utc', now()),
  reviewed_at     timestamptz
);

create index if not exists marketplace_submissions_status_idx on public.marketplace_submissions (status, submitted_at desc);

-- ────────────────────────────────────────────────────────────────────
-- Ecosystem adapter log (external runtime request audit)
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.ecosystem_requests (
  id              uuid primary key default gen_random_uuid(),
  kind            text not null check (kind in ('webhook', 'sdk', 'external_agent', 'mcp_client')),
  source_id       text not null,
  workflow_id     text not null,
  execution_id    uuid,
  status          text not null default 'queued' check (status in ('queued', 'rejected', 'completed', 'failed')),
  metadata        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default timezone('utc', now())
);

create index if not exists ecosystem_requests_kind_idx on public.ecosystem_requests (kind, created_at desc);

-- ────────────────────────────────────────────────────────────────────
-- Row-level security
-- ────────────────────────────────────────────────────────────────────

alter table public.marketplace_listings   enable row level security;
alter table public.marketplace_submissions enable row level security;
alter table public.ecosystem_requests     enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketplace_listings' and policyname='marketplace_listings_select_all') then
    create policy marketplace_listings_select_all on public.marketplace_listings
      for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketplace_submissions' and policyname='marketplace_submissions_select_own') then
    create policy marketplace_submissions_select_own on public.marketplace_submissions
      for select using (auth.uid() = submitted_by);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='marketplace_submissions' and policyname='marketplace_submissions_insert_auth') then
    create policy marketplace_submissions_insert_auth on public.marketplace_submissions
      for insert with check (auth.uid() = submitted_by);
  end if;

  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ecosystem_requests' and policyname='ecosystem_requests_insert') then
    create policy ecosystem_requests_insert on public.ecosystem_requests
      for insert with check (true);
  end if;
end
$$;
