-- Phone Bridge: shared API rate limits across server instances.

create table if not exists phone_bridge_rate_limits (
  key text primary key,
  window_start timestamptz not null,
  hits integer not null default 0,
  blocked_until timestamptz
);

create index if not exists phone_bridge_rate_limits_blocked_idx
  on phone_bridge_rate_limits(blocked_until);
