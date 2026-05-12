-- Phase 3: atomic rate-limit window consumption
-- Prevents race conditions in concurrent read-increment-write sequences.

create or replace function public.consume_rate_limit_entry(
  p_key text,
  p_limit integer,
  p_window_ms integer
)
returns table(allowed boolean, retry_after_ms integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := timezone('utc', now());
  v_count integer;
  v_window_end timestamptz;
begin
  loop
    update public.rate_limit_entries
    set
      count = case when window_end <= v_now then 1 else count + 1 end,
      window_start = case when window_end <= v_now then v_now else window_start end,
      window_end = case
        when window_end <= v_now then v_now + (p_window_ms || ' milliseconds')::interval
        else window_end
      end
    where key = p_key
      and (window_end <= v_now or count < p_limit)
    returning count, window_end
    into v_count, v_window_end;

    if found then
      return query select true, 0;
      return;
    end if;

    select count, window_end
    into v_count, v_window_end
    from public.rate_limit_entries
    where key = p_key;

    if found then
      return query select false, greatest((extract(epoch from (v_window_end - v_now)) * 1000)::integer, 0);
      return;
    end if;

    begin
      insert into public.rate_limit_entries (key, count, window_start, window_end)
      values (
        p_key,
        1,
        v_now,
        v_now + (p_window_ms || ' milliseconds')::interval
      );

      return query select true, 0;
      return;
    exception
      when unique_violation then
        -- Another transaction created the row first; retry the loop.
    end;
  end loop;
end;
$$;
