-- Phone Bridge binary files explicitly selected by the device owner.
-- Migration 0068 already created phone_bridge_files with metadata columns used by
-- call recordings. This migration upgrades that table in-place so existing
-- installations receive the binary payload and upload timestamp columns too.

create table if not exists phone_bridge_files (
  id text primary key,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  file_id text,
  name text not null default 'file',
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  sha256 text not null,
  kind text not null default 'selected',
  uploaded_at timestamptz not null default current_timestamp,
  content bytea not null default decode('', 'hex'),
  call_started_at timestamptz,
  call_ended_at timestamptz,
  call_direction text not null default '',
  call_duration_seconds bigint,
  received_at timestamptz not null default current_timestamp
);

-- 0068 installations already have this table, so the CREATE above does not add
-- columns. Add the fields required by the current upload/admin code explicitly.
alter table phone_bridge_files
  add column if not exists uploaded_at timestamptz;

alter table phone_bridge_files
  add column if not exists content bytea;

alter table phone_bridge_files
  add column if not exists file_id text;

alter table phone_bridge_files
  add column if not exists kind text;

alter table phone_bridge_files
  alter column file_id drop not null;

update phone_bridge_files
set uploaded_at = coalesce(uploaded_at, received_at, current_timestamp)
where uploaded_at is null;

update phone_bridge_files
set content = decode('', 'hex')
where content is null;

update phone_bridge_files
set kind = 'selected'
where kind is null or btrim(kind) = '';

alter table phone_bridge_files
  alter column uploaded_at set default current_timestamp,
  alter column uploaded_at set not null,
  alter column content set default decode('', 'hex'),
  alter column content set not null,
  alter column kind set default 'selected',
  alter column kind set not null;

-- The current selected-file upload path deduplicates by (device_id, sha256).
-- Keep the older (device_id, kind, sha256) index as well for compatibility with
-- older call-recording data.
create unique index if not exists phone_bridge_files_device_hash_uq
  on phone_bridge_files(device_id, sha256);

create index if not exists phone_bridge_files_device_uploaded_idx
  on phone_bridge_files(device_id, uploaded_at desc);
