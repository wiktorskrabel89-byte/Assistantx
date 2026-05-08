-- Atomic increment function for knowledge_qa_cache.usage_count.
-- Avoids the read-then-write race condition in application code by
-- performing a single UPDATE with an expression on the server side.
create or replace function increment_qa_cache_usage(
  answer_id uuid,
  answer_user_id uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update knowledge_qa_cache
  set usage_count = usage_count + 1
  where id = answer_id
    and user_id = answer_user_id;
$$;
