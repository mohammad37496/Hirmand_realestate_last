-- Audit trail for partner-account operations.
create table if not exists partner_audit_logs (
  id text primary key,
  partner_id text not null references partner_accounts(id) on delete cascade,
  action text not null,
  actor text not null default 'admin',
  target_id text,
  note text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp
);

create index if not exists partner_audit_partner_created_idx
  on partner_audit_logs (partner_id, created_at desc);

create index if not exists partner_audit_action_created_idx
  on partner_audit_logs (action, created_at desc);
