-- Shared PostgreSQL-backed throttling for admin and other protected API routes.
create table if not exists admin_rate_limits (
  key text primary key,
  attempts timestamptz[] not null default '{}'::timestamptz[],
  blocked_until timestamptz
);

create index if not exists admin_rate_limits_blocked_idx
  on admin_rate_limits(blocked_until);

create or replace function consume_admin_rate_limit(
  p_key text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns table(allowed boolean, remaining integer, retry_after_seconds integer)
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_attempts timestamptz[];
  v_blocked_until timestamptz;
  v_now timestamptz;
  v_count integer;
begin
  if p_key is null or p_key = '' or p_max_attempts < 1 or p_window_seconds < 1 or p_block_seconds < 1 then
    raise exception 'invalid admin rate limit arguments' using errcode = '22023';
  end if;

  insert into admin_rate_limits(key)
  values (p_key)
  on conflict (key) do nothing;

  select attempts, blocked_until
    into v_attempts, v_blocked_until
    from admin_rate_limits
   where key = p_key
   for update;

  -- Read the clock after acquiring the row lock so lock waits cannot admit stale attempts.
  v_now := clock_timestamp();

  if v_blocked_until is not null and v_blocked_until > v_now then
    return query
      select false, 0, greatest(1, ceil(extract(epoch from (v_blocked_until - v_now)))::integer);
    return;
  end if;

  select coalesce(array_agg(attempt order by attempt), '{}'::timestamptz[])
    into v_attempts
    from unnest(v_attempts) as recent(attempt)
   where attempt >= v_now - make_interval(secs => p_window_seconds);

  v_attempts := array_append(v_attempts, v_now);
  v_count := cardinality(v_attempts);

  if v_count > p_max_attempts then
    v_blocked_until := v_now + make_interval(secs => p_block_seconds);
    -- Match the former Redis contract: discard hits when the block starts,
    -- otherwise the first request after expiry could immediately re-block.
    update admin_rate_limits
       set attempts = '{}'::timestamptz[], blocked_until = v_blocked_until
     where key = p_key;
    return query select false, 0, p_block_seconds;
    return;
  end if;

  update admin_rate_limits
     set attempts = v_attempts, blocked_until = null
   where key = p_key;
  return query select true, greatest(0, p_max_attempts - v_count), 0;
end;
$function$;
