-- Add an index on website_creator_snapshots.user_id to support efficient
-- lookups by user and fast cascading deletes when an auth.users row is removed.
-- (Postgres does not automatically index foreign-key columns.)

create index if not exists website_creator_snapshots_user_idx
  on public.website_creator_snapshots(user_id);
