-- Phone ↔ PC pairing for Jarvis installs under the same authenticated account.

create table if not exists public.device_pairs (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  pairing_code     text not null,
  initiator_device text not null check (initiator_device in ('phone', 'pc')),
  status           text not null default 'pending' check (status in ('pending', 'paired', 'expired')),
  created_at       timestamptz not null default timezone('utc', now()),
  expires_at       timestamptz not null default (timezone('utc', now()) + interval '10 minutes'),
  paired_at        timestamptz
);

alter table public.device_pairs enable row level security;

create index if not exists device_pairs_user_id_pairing_code_idx
  on public.device_pairs (user_id, pairing_code);

create index if not exists device_pairs_pairing_code_status_idx
  on public.device_pairs (pairing_code, status);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_pairs'
      and policyname = 'device_pairs_select_own'
  ) then
    create policy device_pairs_select_own on public.device_pairs
      for select
      using (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_pairs'
      and policyname = 'device_pairs_insert_own'
  ) then
    create policy device_pairs_insert_own on public.device_pairs
      for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'device_pairs'
      and policyname = 'device_pairs_update_own'
  ) then
    create policy device_pairs_update_own on public.device_pairs
      for update
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

create or replace function public.confirm_device_pairing(p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_rows_updated integer := 0;
begin
  if v_user_id is null then
    return false;
  end if;

  update public.device_pairs
     set status = 'expired'
   where user_id = v_user_id
     and status = 'pending'
     and expires_at <= timezone('utc', now());

  update public.device_pairs
     set status = 'paired',
         paired_at = timezone('utc', now())
   where user_id = v_user_id
     and pairing_code = upper(trim(p_code))
     and status = 'pending'
     and expires_at > timezone('utc', now());

  get diagnostics v_rows_updated = row_count;

  if v_rows_updated > 0 then
    update public.device_pairs
       set status = 'expired'
     where user_id = v_user_id
       and status = 'pending'
       and pairing_code <> upper(trim(p_code));
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.confirm_device_pairing(text) to authenticated;
