create extension if not exists pgcrypto;

create table if not exists public.generated_images (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  prompt text not null,
  enhanced_prompt text,
  provider text not null,
  model text not null,
  quality text not null default 'fast' check (quality in ('fast', 'high')),
  image_url text not null,
  storage_path text,
  width integer,
  height integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.web_search_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  query text not null,
  query_hash text not null,
  provider text not null,
  answer text,
  results jsonb not null default '[]'::jsonb,
  result_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  expires_at timestamptz not null,
  unique (user_id, query_hash)
);

create table if not exists public.usage_analytics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  provider text,
  model text,
  route text,
  token_input integer,
  token_output integer,
  estimated_cost_usd numeric(10, 5),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists generated_images_user_created_idx
  on public.generated_images (user_id, created_at desc);

create index if not exists web_search_cache_user_hash_idx
  on public.web_search_cache (user_id, query_hash);

create index if not exists web_search_cache_expiry_idx
  on public.web_search_cache (expires_at);

create index if not exists usage_analytics_user_created_idx
  on public.usage_analytics (user_id, created_at desc);

create index if not exists usage_analytics_event_created_idx
  on public.usage_analytics (event_type, created_at desc);

alter table public.generated_images enable row level security;
alter table public.web_search_cache enable row level security;
alter table public.usage_analytics enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'generated_images' and policyname = 'generated_images_select_own'
  ) then
    create policy generated_images_select_own on public.generated_images
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'generated_images' and policyname = 'generated_images_insert_own'
  ) then
    create policy generated_images_insert_own on public.generated_images
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'generated_images' and policyname = 'generated_images_update_own'
  ) then
    create policy generated_images_update_own on public.generated_images
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'generated_images' and policyname = 'generated_images_delete_own'
  ) then
    create policy generated_images_delete_own on public.generated_images
      for delete using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'web_search_cache' and policyname = 'web_search_cache_select_own'
  ) then
    create policy web_search_cache_select_own on public.web_search_cache
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'web_search_cache' and policyname = 'web_search_cache_insert_own'
  ) then
    create policy web_search_cache_insert_own on public.web_search_cache
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'web_search_cache' and policyname = 'web_search_cache_update_own'
  ) then
    create policy web_search_cache_update_own on public.web_search_cache
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'web_search_cache' and policyname = 'web_search_cache_delete_own'
  ) then
    create policy web_search_cache_delete_own on public.web_search_cache
      for delete using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'usage_analytics' and policyname = 'usage_analytics_select_own'
  ) then
    create policy usage_analytics_select_own on public.usage_analytics
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'usage_analytics' and policyname = 'usage_analytics_insert_own'
  ) then
    create policy usage_analytics_insert_own on public.usage_analytics
      for insert with check (auth.uid() = user_id or user_id is null);
  end if;
end
$$;

insert into storage.buckets (id, name, public)
values ('generated-images', 'generated-images', true)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'generated_images_bucket_insert_own'
  ) then
    create policy generated_images_bucket_insert_own on storage.objects
      for insert
      with check (bucket_id = 'generated-images' and auth.uid()::text = split_part(name, '/', 1));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'generated_images_bucket_update_own'
  ) then
    create policy generated_images_bucket_update_own on storage.objects
      for update
      using (bucket_id = 'generated-images' and auth.uid()::text = split_part(name, '/', 1))
      with check (bucket_id = 'generated-images' and auth.uid()::text = split_part(name, '/', 1));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'generated_images_bucket_delete_own'
  ) then
    create policy generated_images_bucket_delete_own on storage.objects
      for delete
      using (bucket_id = 'generated-images' and auth.uid()::text = split_part(name, '/', 1));
  end if;
end
$$;
