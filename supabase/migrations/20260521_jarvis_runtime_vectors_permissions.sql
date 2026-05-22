-- Jarvis runtime hardening: vector memory, command policies, and audit trail.

create extension if not exists vector;

alter table public.jarvis_cloud_memory
  add column if not exists command_permission_state jsonb not null default '{}'::jsonb;

create table if not exists public.jarvis_memory_vectors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text,
  source text not null default 'jarvis',
  command_scope text not null default 'default' check (command_scope in ('default', 'auto', 'full')),
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  embedding vector(768) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists jarvis_memory_vectors_user_device_idx
  on public.jarvis_memory_vectors (user_id, device_id);

create index if not exists jarvis_memory_vectors_scope_idx
  on public.jarvis_memory_vectors (command_scope);

create index if not exists jarvis_memory_vectors_embedding_idx
  on public.jarvis_memory_vectors using ivfflat (embedding vector_cosine_ops) with (lists = 100);

alter table public.jarvis_memory_vectors enable row level security;

drop policy if exists "Users can select own jarvis vectors" on public.jarvis_memory_vectors;
create policy "Users can select own jarvis vectors"
  on public.jarvis_memory_vectors for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own jarvis vectors" on public.jarvis_memory_vectors;
create policy "Users can insert own jarvis vectors"
  on public.jarvis_memory_vectors for insert
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own jarvis vectors" on public.jarvis_memory_vectors;
create policy "Users can update own jarvis vectors"
  on public.jarvis_memory_vectors for update
  using (auth.uid() = user_id);

drop policy if exists "Users can delete own jarvis vectors" on public.jarvis_memory_vectors;
create policy "Users can delete own jarvis vectors"
  on public.jarvis_memory_vectors for delete
  using (auth.uid() = user_id);

create table if not exists public.jarvis_command_permissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text,
  command_name text not null,
  default_policy text not null default 'default'
    check (default_policy in ('default', 'auto', 'full', 'deny')),
  require_interactive_approval boolean not null default true,
  allowed_paths text[] not null default '{}'::text[],
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, device_id, command_name)
);

create index if not exists jarvis_command_permissions_lookup_idx
  on public.jarvis_command_permissions (user_id, command_name);

alter table public.jarvis_command_permissions enable row level security;

drop policy if exists "Users can manage own jarvis command permissions" on public.jarvis_command_permissions;
create policy "Users can manage own jarvis command permissions"
  on public.jarvis_command_permissions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.jarvis_command_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id text,
  command_name text not null,
  risk_level text not null check (risk_level in ('default', 'auto', 'full')),
  permission_level text not null check (permission_level in ('default', 'auto', 'full')),
  requires_interactive_approval boolean not null default true,
  approved boolean not null default false,
  approval_channel text,
  execution_status text not null check (execution_status in ('pending', 'approved', 'denied', 'executed', 'failed')),
  result_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists jarvis_command_audit_logs_user_created_idx
  on public.jarvis_command_audit_logs (user_id, created_at desc);

create index if not exists jarvis_command_audit_logs_device_idx
  on public.jarvis_command_audit_logs (device_id);

alter table public.jarvis_command_audit_logs enable row level security;

drop policy if exists "Users can select own jarvis command audit logs" on public.jarvis_command_audit_logs;
create policy "Users can select own jarvis command audit logs"
  on public.jarvis_command_audit_logs for select
  using (auth.uid() = user_id);

drop policy if exists "Users can insert own jarvis command audit logs" on public.jarvis_command_audit_logs;
create policy "Users can insert own jarvis command audit logs"
  on public.jarvis_command_audit_logs for insert
  with check (auth.uid() = user_id);

create or replace function public.jarvis_touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists jarvis_memory_vectors_touch_updated_at on public.jarvis_memory_vectors;
create trigger jarvis_memory_vectors_touch_updated_at
  before update on public.jarvis_memory_vectors
  for each row execute function public.jarvis_touch_updated_at();

drop trigger if exists jarvis_command_permissions_touch_updated_at on public.jarvis_command_permissions;
create trigger jarvis_command_permissions_touch_updated_at
  before update on public.jarvis_command_permissions
  for each row execute function public.jarvis_touch_updated_at();

create or replace function public.jarvis_search_memory_vectors(
  p_query_embedding vector(768),
  p_match_count integer default 8,
  p_min_similarity real default 0.68,
  p_scope text default null
)
returns table (
  id uuid,
  content text,
  metadata jsonb,
  command_scope text,
  similarity real,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    v.id,
    v.content,
    v.metadata,
    v.command_scope,
    (1 - (v.embedding <=> p_query_embedding))::real as similarity,
    v.created_at
  from public.jarvis_memory_vectors v
  where v.user_id = auth.uid()
    and (p_scope is null or v.command_scope = p_scope)
    and (1 - (v.embedding <=> p_query_embedding)) >= p_min_similarity
  order by v.embedding <=> p_query_embedding
  limit greatest(1, least(coalesce(p_match_count, 8), 50));
$$;
