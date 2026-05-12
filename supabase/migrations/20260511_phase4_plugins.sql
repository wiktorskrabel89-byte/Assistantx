-- Phase 4: plugin manifests and MCP server registration tables

-- ────────────────────────────────────────────────────────────────────
-- Plugin manifests
-- ────────────────────────────────────────────────────────────────────

create table if not exists public.plugin_manifests (
  id               uuid primary key default gen_random_uuid(),
  plugin_id        text not null unique,
  name             text not null,
  version          text not null,
  description      text,
  author           text,
  homepage         text,
  capabilities     jsonb not null default '[]'::jsonb,
  required_scopes  jsonb not null default '[]'::jsonb,
  sandboxed        boolean not null default true,
  trusted_publisher boolean not null default false,
  status           text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'deprecated')),
  reviewed_by      uuid references auth.users(id) on delete set null,
  reviewed_at      timestamptz,
  organization_id  uuid references public.organizations(id) on delete set null,
  created_at       timestamptz not null default timezone('utc', now()),
  updated_at       timestamptz not null default timezone('utc', now())
);

create index if not exists plugin_manifests_status_idx on public.plugin_manifests (status);
create index if not exists plugin_manifests_org_idx    on public.plugin_manifests (organization_id);

-- ────────────────────────────────────────────────────────────────────
-- Row-level security
-- ────────────────────────────────────────────────────────────────────

alter table public.plugin_manifests enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='plugin_manifests' and policyname='plugins_select_approved') then
    create policy plugins_select_approved on public.plugin_manifests
      for select using (
        status = 'approved'
        or (organization_id is not null and public.is_org_member(organization_id))
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='plugin_manifests' and policyname='plugins_insert_org') then
    create policy plugins_insert_org on public.plugin_manifests
      for insert with check (
        organization_id is null
        or public.is_org_admin(organization_id)
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='plugin_manifests' and policyname='plugins_update_org') then
    create policy plugins_update_org on public.plugin_manifests
      for update using (
        organization_id is null
        or public.is_org_admin(organization_id)
      );
  end if;
end
$$;
