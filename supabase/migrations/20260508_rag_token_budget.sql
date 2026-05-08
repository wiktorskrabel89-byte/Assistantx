-- Add a stored generated column to knowledge_chunks that estimates token length.
-- Uses the same 4-chars-per-token approximation used throughout the codebase.
alter table public.knowledge_chunks
  add column if not exists token_len int
    generated always as (pg_catalog.length(content) / 4) stored;

-- ─────────────────────────────────────────────────────────────────────────────
-- match_documents — vector search with a token budget
-- ─────────────────────────────────────────────────────────────────────────────
-- Fetches up to match_count candidate chunks ordered by cosine similarity,
-- then walks them in similarity order and stops when the accumulated token_len
-- would exceed max_total_tokens.  The caller receives only the selected chunks.

create or replace function public.match_documents(
  p_user_id        uuid,
  p_query_embedding vector(768),
  match_count      integer default 10,
  max_total_tokens integer default 1500
)
returns table (
  chunk_id   uuid,
  file_id    uuid,
  file_name  text,
  content    text,
  token_len  int,
  similarity real
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r            record;
  total_tokens integer := 0;
begin
  for r in
    select
      kc.id                                                      as chunk_id,
      kc.file_id,
      kf.file_name,
      kc.content,
      kc.token_len,
      (1 - (kc.embedding <=> p_query_embedding))::real          as similarity
    from public.knowledge_chunks kc
    join public.knowledge_files  kf on kf.id = kc.file_id
    where kc.user_id = p_user_id
      and (1 - (kc.embedding <=> p_query_embedding)) >= 0.72
    order by kc.embedding <=> p_query_embedding
    limit greatest(1, least(match_count, 20))
  loop
    -- Stop before exceeding the token budget.
    if total_tokens + coalesce(r.token_len, 0) > max_total_tokens then
      exit;
    end if;
    total_tokens := total_tokens + coalesce(r.token_len, 0);

    chunk_id  := r.chunk_id;
    file_id   := r.file_id;
    file_name := r.file_name;
    content   := r.content;
    token_len := r.token_len;
    similarity := r.similarity;
    return next;
  end loop;
end;
$$;

-- Only authenticated users may call this function (user_id filter enforces
-- row-level ownership inside the function body).
grant execute on function public.match_documents(uuid, vector, integer, integer)
  to authenticated;
