-- Phone Bridge: explicit, owner-controlled device sync data.
-- Raw payloads are private operational data and are never exposed by public APIs.

create table if not exists phone_bridge_devices (
  id text primary key,
  name text not null default '',
  manufacturer text not null default '',
  model text not null default '',
  android_version text not null default '',
  sdk_int integer,
  first_seen_at timestamptz not null default current_timestamp,
  last_seen_at timestamptz not null default current_timestamp,
  last_sync_id text,
  last_summary jsonb not null default '{}'::jsonb,
  enabled boolean not null default true
);

create index if not exists phone_bridge_devices_last_seen_idx
  on phone_bridge_devices(last_seen_at desc);

create table if not exists phone_bridge_syncs (
  id text primary key,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  schema_name text not null default '',
  sent_at timestamptz,
  received_at timestamptz not null default current_timestamp,
  payload_bytes integer not null default 0,
  summary jsonb not null default '{}'::jsonb,
  payload jsonb not null
);

create index if not exists phone_bridge_syncs_device_received_idx
  on phone_bridge_syncs(device_id, received_at desc);

create index if not exists phone_bridge_syncs_received_idx
  on phone_bridge_syncs(received_at desc);
