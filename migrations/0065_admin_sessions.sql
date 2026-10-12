create table if not exists admin_sessions (
  id text primary key,
  created_at timestamptz not null default current_timestamp,
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default current_timestamp,
  revoked_at timestamptz,
  client_hash text not null default '',
  user_agent text not null default ''
);

create index if not exists admin_sessions_active_idx
  on admin_sessions (expires_at desc)
  where revoked_at is null;

create index if not exists admin_sessions_created_idx
  on admin_sessions (created_at desc);
