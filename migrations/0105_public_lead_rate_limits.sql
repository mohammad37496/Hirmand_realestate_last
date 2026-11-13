-- Shared PostgreSQL-backed throttling for public property and lead requests.
create table if not exists public_lead_rate_limits (
  key text primary key,
  attempts timestamptz[] not null default '{}'::timestamptz[],
  blocked_until timestamptz
);

create index if not exists public_lead_rate_limits_blocked_idx
  on public_lead_rate_limits(blocked_until);
