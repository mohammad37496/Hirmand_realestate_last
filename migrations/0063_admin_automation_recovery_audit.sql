-- Admin automation, recovery and security audit trail.

alter table properties
  add column if not exists publish_at timestamptz,
  add column if not exists unpublish_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_from_status text;

create index if not exists properties_public_schedule_idx
  on properties (publish_at, unpublish_at, published_at desc)
  where deleted_at is null;

create index if not exists properties_trash_idx
  on properties (deleted_at desc)
  where deleted_at is not null;

create table if not exists admin_audit_log (
  id bigserial primary key,
  action text not null,
  entity_type text not null,
  entity_id text,
  entity_title text not null default '',
  actor text not null default 'admin',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp
);

create index if not exists admin_audit_log_created_idx
  on admin_audit_log (created_at desc);

create index if not exists admin_audit_log_entity_idx
  on admin_audit_log (entity_type, entity_id, created_at desc);
