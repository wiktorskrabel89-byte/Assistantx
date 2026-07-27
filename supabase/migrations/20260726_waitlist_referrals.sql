-- Waitlist referrals.
--
-- Every waitlist signup gets a short unique referral_code auto-generated
-- on insert. New signups can optionally include a `referred_by` code that
-- points at another row's referral_code. We surface referral leaderboards
-- in the admin dashboard and use the referral link to boost sharing.
--
-- referral_count is a materialised counter kept in sync by a trigger, so
-- the admin leaderboard can query without a subquery-per-row.

-- 1. Columns
alter table public.waitlist_signups
  add column if not exists referral_code text unique,
  add column if not exists referred_by text references public.waitlist_signups(referral_code) on delete set null,
  add column if not exists referral_count integer not null default 0;

create index if not exists waitlist_signups_referral_count_idx
  on public.waitlist_signups (referral_count desc, created_at asc);

create index if not exists waitlist_signups_referred_by_idx
  on public.waitlist_signups (referred_by)
  where referred_by is not null;

-- 2. Random-code generator (unbiased base-32 style, 8 chars = 32^8 space).
create or replace function public._gen_referral_code() returns text
language plpgsql volatile
security definer
set search_path = public, pg_temp
as $$
declare
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- 32 chars, no ambiguous 0/O/1/I
  n int := length(alphabet);
  out text := '';
  i int;
  attempt int := 0;
begin
  loop
    out := '';
    for i in 1..8 loop
      out := out || substr(alphabet, floor(random() * n)::int + 1, 1);
    end loop;
    -- Retry on collision (astronomically rare).
    exit when not exists (
      select 1 from public.waitlist_signups where referral_code = out
    );
    attempt := attempt + 1;
    if attempt > 8 then
      -- Fall back to a longer code to guarantee termination in the wildly
      -- unlikely event of repeated collisions.
      out := out || substr(alphabet, floor(random() * n)::int + 1, 1);
      exit;
    end if;
  end loop;
  return out;
end
$$;

-- 3. Trigger: assign a code to any new row that doesn't already have one.
create or replace function public._assign_referral_code() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.referral_code is null then
    new.referral_code := public._gen_referral_code();
  end if;
  return new;
end
$$;

drop trigger if exists waitlist_signups_assign_referral on public.waitlist_signups;
create trigger waitlist_signups_assign_referral
  before insert on public.waitlist_signups
  for each row execute function public._assign_referral_code();

-- 4. Trigger: keep referral_count in sync on referred_by changes.
create or replace function public._bump_referrer_count() returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if new.referred_by is not null then
      update public.waitlist_signups
        set referral_count = referral_count + 1
        where referral_code = new.referred_by;
    end if;
  elsif tg_op = 'DELETE' then
    if old.referred_by is not null then
      update public.waitlist_signups
        set referral_count = greatest(0, referral_count - 1)
        where referral_code = old.referred_by;
    end if;
  end if;
  return coalesce(new, old);
end
$$;

drop trigger if exists waitlist_signups_bump_referrer_insert on public.waitlist_signups;
create trigger waitlist_signups_bump_referrer_insert
  after insert on public.waitlist_signups
  for each row execute function public._bump_referrer_count();

drop trigger if exists waitlist_signups_bump_referrer_delete on public.waitlist_signups;
create trigger waitlist_signups_bump_referrer_delete
  after delete on public.waitlist_signups
  for each row execute function public._bump_referrer_count();

-- 5. Backfill: existing rows get a code.
update public.waitlist_signups
  set referral_code = public._gen_referral_code()
  where referral_code is null;

-- 6. Public RPC: look up a signup by referral code (used by the API to
-- validate a ?ref=CODE query param before storing referred_by).
create or replace function public.waitlist_referrer_exists(p_code text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists(select 1 from public.waitlist_signups where referral_code = p_code)
$$;

grant execute on function public.waitlist_referrer_exists(text) to anon, authenticated;
