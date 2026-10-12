-- Admin accounts/roles, persistent notification inbox and backup history metadata.
create table if not exists admin_accounts (
  id text primary key,
  username text not null unique,
  display_name text not null default '',
  password_hash text not null,
  role text not null default 'owner'
    check (role in ('owner','manager','sales','content','viewer')),
  is_active boolean not null default true,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  last_login_at timestamptz
);

create index if not exists admin_accounts_active_idx
  on admin_accounts (is_active, role);

alter table admin_sessions
  add column if not exists account_id text references admin_accounts(id) on delete set null,
  add column if not exists role text not null default 'owner';

create index if not exists admin_sessions_account_idx
  on admin_sessions (account_id, created_at desc);

create table if not exists admin_notifications (
  id bigserial primary key,
  source_key text not null unique,
  kind text not null,
  severity text not null default 'info'
    check (severity in ('info','warning','critical')),
  title text not null,
  body text not null default '',
  entity_type text,
  entity_id text,
  created_at timestamptz not null default current_timestamp,
  read_at timestamptz
);

create index if not exists admin_notifications_inbox_idx
  on admin_notifications (read_at, created_at desc);

create index if not exists admin_notifications_entity_idx
  on admin_notifications (entity_type, entity_id, created_at desc);

create index if not exists admin_backup_log_created_idx
  on admin_backup_log (created_at desc);
