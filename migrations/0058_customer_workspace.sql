-- Cross-device private workspace for authenticated customers.
-- All rows are scoped to Better Auth user ids; no client-supplied owner is trusted.
create table if not exists customer_workspace (
  user_id text primary key,
  favorites jsonb not null default '[]'::jsonb,
  favorite_meta jsonb not null default '{}'::jsonb,
  saved_searches jsonb not null default '[]'::jsonb,
  recent_properties jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists customer_workspace_updated_idx
  on customer_workspace (updated_at desc);
