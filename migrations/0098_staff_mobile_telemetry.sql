-- Independent telemetry storage for the new staff Android app.
-- This migration is deliberately separate from all legacy Phone Bridge tables.
--
-- Retention policy:
--   location samples: 30 days
--   general telemetry: 30 days
--   usage_snapshot telemetry: 14 days
--   ingest audit logs: 30 days
--
-- Transport encryption is provided by HTTPS. Device bearer tokens are never
-- stored in plaintext; only SHA-256 token digests are persisted.

alter table staff_mobile_devices
  add column if not exists auth_token_hash text,
  add column if not exists auth_token_created_at timestamptz;

create unique index if not exists staff_mobile_devices_token_hash_uidx
  on staff_mobile_devices (auth_token_hash)
  where auth_token_hash is not null;

create table if not exists staff_mobile_telemetry (
  id text primary key,
  device_id text not null,
  staff_id text not null,
  client_event_id text not null,
  event_type text not null
    check (event_type in ('app_heartbeat','usage_snapshot','permission_state')),
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  received_at timestamptz not null default current_timestamp
);

create unique index if not exists staff_mobile_telemetry_device_event_uidx
  on staff_mobile_telemetry (device_id, client_event_id);

create index if not exists staff_mobile_telemetry_device_time_idx
  on staff_mobile_telemetry (device_id, observed_at desc);

create index if not exists staff_mobile_telemetry_staff_time_idx
  on staff_mobile_telemetry (staff_id, observed_at desc);

create index if not exists staff_mobile_telemetry_type_time_idx
  on staff_mobile_telemetry (event_type, observed_at desc);

create table if not exists staff_mobile_locations (
  id text primary key,
  device_id text not null,
  staff_id text not null,
  client_event_id text not null,
  latitude numeric(9,6) not null,
  longitude numeric(9,6) not null,
  accuracy_m numeric(10,2),
  altitude_m numeric(10,2),
  speed_mps numeric(10,2),
  provider text not null default '',
  observed_at timestamptz not null,
  received_at timestamptz not null default current_timestamp
);

create unique index if not exists staff_mobile_locations_device_event_uidx
  on staff_mobile_locations (device_id, client_event_id);

create index if not exists staff_mobile_locations_device_time_idx
  on staff_mobile_locations (device_id, observed_at desc);

create index if not exists staff_mobile_locations_staff_time_idx
  on staff_mobile_locations (staff_id, observed_at desc);

create table if not exists staff_mobile_ingest_log (
  id text primary key,
  device_id text not null,
  staff_id text not null,
  endpoint text not null,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  received_at timestamptz not null default current_timestamp
);

create index if not exists staff_mobile_ingest_log_device_time_idx
  on staff_mobile_ingest_log (device_id, received_at desc);

create index if not exists staff_mobile_ingest_log_received_idx
  on staff_mobile_ingest_log (received_at desc);
