-- CRM operations, finance ledger, and audit-friendly activity timeline.
create table if not exists lead_activities (
  id bigserial primary key,
  lead_id text not null references leads(id) on delete cascade,
  activity_type text not null default 'note'
    check (activity_type in ('note','call','whatsapp','match','visit','follow_up','status','document')),
  title text not null default '',
  note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp
);

create index if not exists lead_activities_lead_created_idx
  on lead_activities (lead_id, created_at desc);

create index if not exists lead_activities_created_idx
  on lead_activities (created_at desc);

create table if not exists finance_transactions (
  id bigserial primary key,
  kind text not null check (kind in ('income','expense')),
  title text not null,
  amount numeric(20,0) not null check (amount >= 0),
  transaction_date date not null default current_date,
  property_id text,
  lead_id text,
  consultant text not null default '',
  category text not null default '',
  note text not null default '',
  created_at timestamptz not null default current_timestamp
);

create index if not exists finance_transactions_date_idx
  on finance_transactions (transaction_date desc, created_at desc);

create index if not exists finance_transactions_property_idx
  on finance_transactions (property_id);

create index if not exists finance_transactions_lead_idx
  on finance_transactions (lead_id);

create table if not exists admin_backup_log (
  id bigserial primary key,
  kind text not null default 'json_export',
  created_at timestamptz not null default current_timestamp,
  table_counts jsonb not null default '{}'::jsonb
);
