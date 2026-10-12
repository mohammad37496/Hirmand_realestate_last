-- Management targets and reusable CRM segments.
create table if not exists admin_consultant_targets (
  id text primary key,
  consultant text not null,
  target_month date not null,
  lead_target integer not null default 0 check (lead_target >= 0),
  contract_target integer not null default 0 check (contract_target >= 0),
  volume_target numeric not null default 0 check (volume_target >= 0),
  commission_target numeric not null default 0 check (commission_target >= 0),
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (consultant, target_month)
);
create index if not exists admin_consultant_targets_month_idx
  on admin_consultant_targets(target_month, consultant);

create table if not exists admin_saved_lead_segments (
  id text primary key,
  title text not null,
  query text not null default '',
  status text not null default 'all' check (status in ('all','new','contacted','follow_up','visited','contract','closed','spam')),
  sort text not null default 'priority' check (sort in ('newest','oldest','name','follow_up','priority')),
  created_by text not null default '',
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);
create index if not exists admin_saved_lead_segments_updated_idx
  on admin_saved_lead_segments(updated_at desc);
