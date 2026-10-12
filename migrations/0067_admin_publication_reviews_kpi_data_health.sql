-- Publication approvals, daily KPI snapshots, and persistent data-health findings.
create table if not exists property_publication_reviews (
  id bigserial primary key,
  property_id text not null references properties(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  requested_by text not null default 'مدیر',
  request_note text not null default '',
  reviewed_by text,
  review_note text,
  requested_at timestamptz not null default current_timestamp,
  reviewed_at timestamptz
);

create index if not exists property_publication_reviews_queue_idx
  on property_publication_reviews (status, requested_at desc);

create unique index if not exists property_publication_reviews_pending_uq
  on property_publication_reviews (property_id)
  where status = 'pending';

create table if not exists admin_kpi_snapshots (
  id bigserial primary key,
  snapshot_date date not null unique,
  properties_total integer not null default 0,
  published_properties integer not null default 0,
  leads_total integer not null default 0,
  leads_last7 integer not null default 0,
  contracts_last30 integer not null default 0,
  visitors_last7 integer not null default 0,
  calls_last30 integer not null default 0,
  whatsapp_last30 integer not null default 0,
  overdue_followups integer not null default 0,
  incomplete_properties integer not null default 0,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists admin_kpi_snapshots_date_idx
  on admin_kpi_snapshots (snapshot_date desc);

create table if not exists admin_data_health_findings (
  id bigserial primary key,
  source_key text not null unique,
  kind text not null,
  severity text not null default 'warning' check (severity in ('info','warning','critical')),
  title text not null,
  detail text not null default '',
  entity_type text,
  entity_id text,
  detected_at timestamptz not null default current_timestamp,
  resolved_at timestamptz
);

create index if not exists admin_data_health_queue_idx
  on admin_data_health_findings (resolved_at, severity, detected_at desc);
