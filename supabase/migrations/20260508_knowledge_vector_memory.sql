create extension if not exists vector;
create extension if not exists pgcrypto;

create table if not exists public.knowledge_files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_path text not null,
  file_name text not null,
  mime_type text,
  file_size bigint not null default 0,
  status text not null default 'ready' check (status in ('processing', 'ready', 'error')),
  chunk_count integer not null default 0,
  error_message text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  file_id uuid not null references public.knowledge_files(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  token_count integer not null default 0,
  embedding vector(768) not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (file_id, chunk_index)
);

create table if not exists public.knowledge_qa_cache (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  answer text not null,
  question_embedding vector(768) not null,
  similarity_hint real,
  usage_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_profile_memories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  memory_key text not null,
  memory_value text not null,
  source_message text,
  embedding vector(768),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, memory_key)
);

create index if not exists knowledge_files_user_created_idx
  on public.knowledge_files (user_id, created_at desc);

create index if not exists knowledge_chunks_user_file_idx
  on public.knowledge_chunks (user_id, file_id, chunk_index);

create index if not exists knowledge_qa_cache_user_updated_idx
  on public.knowledge_qa_cache (user_id, updated_at desc);

create index if not exists user_profile_memories_user_updated_idx
  on public.user_profile_memories (user_id, updated_at desc);

create index if not exists knowledge_chunks_embedding_idx
  on public.knowledge_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create index if not exists knowledge_qa_cache_embedding_idx
  on public.knowledge_qa_cache using ivfflat (question_embedding vector_cosine_ops) with (lists = 100);

create index if not exists user_profile_memories_embedding_idx
  on public.user_profile_memories using ivfflat (embedding vector_cosine_ops) with (lists = 50);

create or replace function public.set_updated_at_now()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists knowledge_files_set_updated_at on public.knowledge_files;
create trigger knowledge_files_set_updated_at
before update on public.knowledge_files
for each row
execute function public.set_updated_at_now();

drop trigger if exists knowledge_qa_cache_set_updated_at on public.knowledge_qa_cache;
create trigger knowledge_qa_cache_set_updated_at
before update on public.knowledge_qa_cache
for each row
execute function public.set_updated_at_now();

drop trigger if exists user_profile_memories_set_updated_at on public.user_profile_memories;
create trigger user_profile_memories_set_updated_at
before update on public.user_profile_memories
for each row
execute function public.set_updated_at_now();

alter table public.knowledge_files enable row level security;
alter table public.knowledge_chunks enable row level security;
alter table public.knowledge_qa_cache enable row level security;
alter table public.user_profile_memories enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_files' and policyname = 'knowledge_files_select_own'
  ) then
    create policy knowledge_files_select_own on public.knowledge_files
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_files' and policyname = 'knowledge_files_insert_own'
  ) then
    create policy knowledge_files_insert_own on public.knowledge_files
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_files' and policyname = 'knowledge_files_update_own'
  ) then
    create policy knowledge_files_update_own on public.knowledge_files
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_files' and policyname = 'knowledge_files_delete_own'
  ) then
    create policy knowledge_files_delete_own on public.knowledge_files
      for delete using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_chunks' and policyname = 'knowledge_chunks_select_own'
  ) then
    create policy knowledge_chunks_select_own on public.knowledge_chunks
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_chunks' and policyname = 'knowledge_chunks_insert_own'
  ) then
    create policy knowledge_chunks_insert_own on public.knowledge_chunks
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_chunks' and policyname = 'knowledge_chunks_update_own'
  ) then
    create policy knowledge_chunks_update_own on public.knowledge_chunks
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_chunks' and policyname = 'knowledge_chunks_delete_own'
  ) then
    create policy knowledge_chunks_delete_own on public.knowledge_chunks
      for delete using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_qa_cache' and policyname = 'knowledge_qa_cache_select_own'
  ) then
    create policy knowledge_qa_cache_select_own on public.knowledge_qa_cache
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_qa_cache' and policyname = 'knowledge_qa_cache_insert_own'
  ) then
    create policy knowledge_qa_cache_insert_own on public.knowledge_qa_cache
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_qa_cache' and policyname = 'knowledge_qa_cache_update_own'
  ) then
    create policy knowledge_qa_cache_update_own on public.knowledge_qa_cache
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'knowledge_qa_cache' and policyname = 'knowledge_qa_cache_delete_own'
  ) then
    create policy knowledge_qa_cache_delete_own on public.knowledge_qa_cache
      for delete using (auth.uid() = user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profile_memories' and policyname = 'user_profile_memories_select_own'
  ) then
    create policy user_profile_memories_select_own on public.user_profile_memories
      for select using (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profile_memories' and policyname = 'user_profile_memories_insert_own'
  ) then
    create policy user_profile_memories_insert_own on public.user_profile_memories
      for insert with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profile_memories' and policyname = 'user_profile_memories_update_own'
  ) then
    create policy user_profile_memories_update_own on public.user_profile_memories
      for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
  if not exists (
    select 1 from pg_policies where schemaname = 'public' and tablename = 'user_profile_memories' and policyname = 'user_profile_memories_delete_own'
  ) then
    create policy user_profile_memories_delete_own on public.user_profile_memories
      for delete using (auth.uid() = user_id);
  end if;
end
$$;

create or replace function public.match_knowledge_chunks(
  p_user_id uuid,
  p_query_embedding vector(768),
  p_match_count integer default 6,
  p_min_similarity real default 0.72
)
returns table (
  chunk_id uuid,
  file_id uuid,
  file_name text,
  content text,
  similarity real
)
language sql
stable
as $$
  select
    kc.id as chunk_id,
    kc.file_id,
    kf.file_name,
    kc.content,
    (1 - (kc.embedding <=> p_query_embedding))::real as similarity
  from public.knowledge_chunks kc
  join public.knowledge_files kf on kf.id = kc.file_id
  where kc.user_id = p_user_id
    and (1 - (kc.embedding <=> p_query_embedding)) >= p_min_similarity
  order by kc.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 20));
$$;

create or replace function public.match_cached_answers(
  p_user_id uuid,
  p_query_embedding vector(768),
  p_match_count integer default 1,
  p_min_similarity real default 0.9
)
returns table (
  answer_id uuid,
  question text,
  answer text,
  similarity real
)
language sql
stable
as $$
  select
    q.id as answer_id,
    q.question,
    q.answer,
    (1 - (q.question_embedding <=> p_query_embedding))::real as similarity
  from public.knowledge_qa_cache q
  where q.user_id = p_user_id
    and (1 - (q.question_embedding <=> p_query_embedding)) >= p_min_similarity
  order by q.question_embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 5));
$$;

create or replace function public.match_user_profile_memories(
  p_user_id uuid,
  p_query_embedding vector(768),
  p_match_count integer default 4
)
returns table (
  memory_id uuid,
  memory_key text,
  memory_value text,
  similarity real
)
language sql
stable
as $$
  select
    upm.id as memory_id,
    upm.memory_key,
    upm.memory_value,
    coalesce((1 - (upm.embedding <=> p_query_embedding))::real, 0::real) as similarity
  from public.user_profile_memories upm
  where upm.user_id = p_user_id
  order by
    case when upm.embedding is null then 1 else 0 end asc,
    upm.embedding <=> p_query_embedding
  limit greatest(1, least(p_match_count, 20));
$$;

insert into storage.buckets (id, name, public)
values ('knowledge', 'knowledge', false)
on conflict (id) do nothing;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'knowledge_bucket_select_own'
  ) then
    create policy knowledge_bucket_select_own on storage.objects
      for select
      using (bucket_id = 'knowledge' and auth.uid()::text = split_part(name, '/', 1));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'knowledge_bucket_insert_own'
  ) then
    create policy knowledge_bucket_insert_own on storage.objects
      for insert
      with check (bucket_id = 'knowledge' and auth.uid()::text = split_part(name, '/', 1));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'knowledge_bucket_update_own'
  ) then
    create policy knowledge_bucket_update_own on storage.objects
      for update
      using (bucket_id = 'knowledge' and auth.uid()::text = split_part(name, '/', 1))
      with check (bucket_id = 'knowledge' and auth.uid()::text = split_part(name, '/', 1));
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'knowledge_bucket_delete_own'
  ) then
    create policy knowledge_bucket_delete_own on storage.objects
      for delete
      using (bucket_id = 'knowledge' and auth.uid()::text = split_part(name, '/', 1));
  end if;
end
$$;
