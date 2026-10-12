-- Admin deals, transaction documents and property expiry history.
create table if not exists admin_deals (
  id text primary key,
  lead_id text,
  property_id text,
  title text not null,
  deal_type text not null default 'sale' check (deal_type in ('sale','rent','mortgage','buy')),
  status text not null default 'prospect' check (status in ('prospect','negotiation','agreement','contracted','completed','cancelled')),
  customer_name text not null default '',
  customer_phone text not null default '',
  consultant text not null default '',
  amount numeric,
  commission numeric,
  contract_number text not null default '',
  contract_date date,
  closing_date date,
  notes text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);
create index if not exists admin_deals_status_updated_idx on admin_deals(status, updated_at desc);
create index if not exists admin_deals_lead_idx on admin_deals(lead_id);
create index if not exists admin_deals_property_idx on admin_deals(property_id);

create table if not exists admin_deal_documents (
  id text primary key,
  deal_id text not null,
  document_type text not null,
  status text not null default 'pending' check (status in ('pending','received','verified','rejected')),
  file_url text not null default '',
  note text not null default '',
  received_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (deal_id, document_type)
);
create index if not exists admin_deal_documents_deal_idx on admin_deal_documents(deal_id, status);

create table if not exists admin_property_expiry_actions (
  id text primary key,
  property_id text not null,
  action text not null check (action in ('archive','extend','task')),
  details text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default current_timestamp
);
create index if not exists admin_property_expiry_actions_property_idx on admin_property_expiry_actions(property_id, created_at desc);
