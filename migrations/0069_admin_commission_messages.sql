-- Consultant commission settlement, templates for CRM outreach, monthly management snapshots.
create table if not exists admin_commission_settlements (
  id text primary key,
  consultant text not null,
  deal_id text,
  commission_amount numeric not null default 0,
  consultant_share numeric not null default 0,
  office_share numeric not null default 0,
  status text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  paid_at timestamptz,
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);
create index if not exists admin_commission_consultant_idx on admin_commission_settlements(consultant, status, updated_at desc);
create index if not exists admin_commission_deal_idx on admin_commission_settlements(deal_id);
create table if not exists admin_message_templates (
  id text primary key,
  title text not null,
  body text not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp','sms','internal')),
  active boolean not null default true,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);
create index if not exists admin_message_templates_active_idx on admin_message_templates(active, updated_at desc);
