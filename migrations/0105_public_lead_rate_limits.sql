-- Shared PostgreSQL-backed throttling for public property and lead requests.
create table if not exists public_lead_rate_limits (
  key text primary key,
  attempts timestamptz[] not null default '{}'::timestamptz[],
  blocked_until timestamptz
);

create index if not exists public_lead_rate_limits_blocked_idx
  on public_lead_rate_limits(blocked_until);

create or replace function consume_public_lead_rate_limit(
  p_key text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_attempts timestamptz[];
  v_blocked_until timestamptz;
  v_now timestamptz;
begin
  insert into public_lead_rate_limits(key)
  values (p_key)
  on conflict (key) do nothing;

  select attempts, blocked_until
    into v_attempts, v_blocked_until
    from public_lead_rate_limits
   where key = p_key
   for update;

  -- Capture time only after the row lock is acquired. A concurrent request may
  -- have waited long enough for earlier attempts to leave the rolling window.
  v_now := clock_timestamp();

  if v_blocked_until is not null and v_blocked_until > v_now then
    return query
      select false, greatest(1, ceil(extract(epoch from (v_blocked_until - v_now)))::integer);
    return;
  end if;

  select coalesce(array_agg(attempt order by attempt), '{}'::timestamptz[])
    into v_attempts
    from unnest(v_attempts) as recent(attempt)
   where attempt > v_now - make_interval(secs => p_window_seconds);

  v_attempts := array_append(v_attempts, v_now);

  if cardinality(v_attempts) > p_max_attempts then
    v_blocked_until := v_now + make_interval(secs => p_block_seconds);
    update public_lead_rate_limits
       set attempts = v_attempts, blocked_until = v_blocked_until
     where key = p_key;
    return query select false, p_block_seconds;
  end if;

  update public_lead_rate_limits
     set attempts = v_attempts, blocked_until = null
   where key = p_key;
  return query select true, 0;
end;
$function$;
