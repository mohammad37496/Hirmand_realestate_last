-- 0068_phone_bridge.sql
--
-- Phone Bridge: enrollment, consent, per-device server policy, the signed sync
-- inbox, remote commands, and the audit trail every sensitive action writes to.
--
-- Append-only migration (0068 follows 0067). Every statement is idempotent so a
-- partially applied run can be replayed, and nothing here drops or rewrites an
-- existing table.
--
-- Parameter-typing notes, because this is exactly where the earlier
-- "could not determine data type of parameter" / 'invalid input syntax for type
-- numeric: "null"' failures came from:
--
--   * A column is NEVER declared NOT NULL while a writer may send JSON null.
--     Nullable numeric columns are used instead, and the writer layer
--     (src/lib/phone-bridge-payload.server.ts) coerces "null"/""/undefined to a
--     real JS null so Postgres receives a typed NULL, never the string 'null'.
--   * Timestamps arrive from Android as epoch milliseconds. They are stored as
--     BIGINT (what the device actually sends) and mirrored into TIMESTAMPTZ via
--     to_timestamp(), so a millisecond value can never be misread as seconds.
--   * Every id column that a foreign key points at has a matching UNIQUE or
--     PRIMARY KEY constraint, so the FKs below are actually enforceable.

-- ---------------------------------------------------------------------------
-- Devices
-- ---------------------------------------------------------------------------

create table if not exists phone_bridge_devices (
  id text primary key,
  name text not null default '',
  manufacturer text not null default '',
  model text not null default '',
  android_version text not null default '',
  sdk_int integer,
  app_version_name text not null default '',
  app_version_code integer,

  -- sha256 hex of the per-device token. The raw token is never stored, logged
  -- or returned after enrollment (src/lib/phone-bridge-auth.server.ts).
  token_hash text not null,
  token_issued_at timestamptz not null default current_timestamp,
  token_revoked_at timestamptz,

  enabled boolean not null default true,
  employee text not null default '',
  group_name text not null default '',

  battery_percent integer,
  battery_charging boolean,
  storage_available_bytes bigint,
  storage_total_bytes bigint,
  ram_available_bytes bigint,
  ram_total_bytes bigint,

  last_seen_at timestamptz,
  last_sync_at timestamptz,
  last_sync_hash text not null default '',
  last_app_version_name text not null default '',
  last_app_version_code integer,

  enrolled_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

-- token_hash is the lookup key for every authenticated request, so it must be
-- unique; without this an insert race could mint two devices on one token.
create unique index if not exists phone_bridge_devices_token_hash_uidx
  on phone_bridge_devices (token_hash);
create index if not exists phone_bridge_devices_seen_idx
  on phone_bridge_devices (last_seen_at desc nulls last);
create index if not exists phone_bridge_devices_enabled_idx
  on phone_bridge_devices (enabled, last_seen_at desc nulls last);

-- ---------------------------------------------------------------------------
-- Pairing tokens (bootstrap credentials, exchanged for a per-device token)
-- ---------------------------------------------------------------------------

create table if not exists phone_bridge_pairing_tokens (
  id text primary key,
  -- sha256 hex. The operator-facing plaintext exists only in the admin UI at
  -- creation time.
  token_hash text not null,
  label text not null default '',
  created_at timestamptz not null default current_timestamp,
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by_device_id text references phone_bridge_devices (id) on delete set null,
  revoked_at timestamptz
);

create unique index if not exists phone_bridge_pairing_tokens_hash_uidx
  on phone_bridge_pairing_tokens (token_hash);
create index if not exists phone_bridge_pairing_tokens_open_idx
  on phone_bridge_pairing_tokens (expires_at)
  where used_at is null and revoked_at is null;

-- ---------------------------------------------------------------------------
-- Consent (recorded by the user on the device, enforced by the server)
-- ---------------------------------------------------------------------------

create table if not exists phone_bridge_consents (
  id text primary key,
  device_id text not null references phone_bridge_devices (id) on delete cascade,
  version integer not null default 1,
  policy_version text not null default '',
  -- jsonb object: scope -> true. Defaults to "nothing consented".
  scopes jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default current_timestamp,
  revoked_at timestamptz,
  source text not null default 'device',
  audit_id text
);

create index if not exists phone_bridge_consents_device_idx
  on phone_bridge_consents (device_id, accepted_at desc);
-- At most one live (non-revoked) consent record per device.
create unique index if not exists phone_bridge_consents_active_uidx
  on phone_bridge_consents (device_id)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Per-device server policy
--
-- Server policy is an *additional* gate. It can never substitute for user
-- consent: a module needs consent AND policy, and the effective-access helper
-- in src/lib/phone-bridge-auth.server.ts requires both.
-- ---------------------------------------------------------------------------

create table if not exists phone_bridge_policies (
  device_id text primary key references phone_bridge_devices (id) on delete cascade,
  -- jsonb object: module -> true/false. Absent module == disallowed.
  modules jsonb not null default '{}'::jsonb,
  min_app_version_code integer,
  updated_at timestamptz not null default current_timestamp,
  updated_by text not null default ''
);

-- ---------------------------------------------------------------------------
-- Sync inbox
-- ---------------------------------------------------------------------------

create table if not exists phone_bridge_snapshots (
  id text primary key,
  device_id text not null references phone_bridge_devices (id) on delete cascade,
  sync_id text not null default '',
  snapshot_hash text not null default '',
  schema text not null default '',
  app_version_name text not null default '',
  app_version_code integer,
  -- Raw operational payload. Retention TTL is applied by the purge path in
  -- src/lib/phone-bridge-events.server.ts; see privacy retention policy.
  payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null default current_timestamp
);

-- The client re-sends the same snapshot_hash when nothing changed, so this
-- unique index is what makes a retried packet idempotent instead of a duplicate.
create unique index if not exists phone_bridge_snapshots_device_hash_uidx
  on phone_bridge_snapshots (device_id, snapshot_hash)
  where snapshot_hash <> '';
create index if not exists phone_bridge_snapshots_device_idx
  on phone_bridge_snapshots (device_id, received_at desc);

create table if not exists phone_bridge_locations (
  id text primary key,
  device_id text not null references phone_bridge_devices (id) on delete cascade,
  -- clientPointId from the device. Unique per device so a retried upload of the
  -- same fix lands once instead of twice.
  client_point_id text not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters double precision,
  altitude_meters double precision,
  speed_mps double precision,
  bearing_degrees double precision,
  provider text not null default '',
  recorded_at_ms bigint not null,
  recorded_at timestamptz not null,
  received_at timestamptz not null default current_timestamp
);

create unique index if not exists phone_bridge_locations_point_uidx
  on phone_bridge_locations (device_id, client_point_id);
create index if not exists phone_bridge_locations_time_idx
  on phone_bridge_locations (device_id, recorded_at desc);

create table if not exists phone_bridge_files (
  id text primary key,
  device_id text not null references phone_bridge_devices (id) on delete cascade,
  file_id text not null,
  name text not null default '',
  mime_type text not null default '',
  size_bytes bigint not null,
  sha256 text not null,
  kind text not null default 'selected',
  call_started_at timestamptz,
  call_ended_at timestamptz,
  call_direction text not null default '',
  call_duration_seconds bigint,
  received_at timestamptz not null default current_timestamp
);

-- Content-addressed dedupe: the same bytes from the same device are stored
-- once, and the upload reports deduplicated=true.
create unique index if not exists phone_bridge_files_device_sha_uidx
  on phone_bridge_files (device_id, kind, sha256);
create index if not exists phone_bridge_files_device_idx
  on phone_bridge_files (device_id, received_at desc);

create table if not exists phone_bridge_heartbeats (
  id bigserial primary key,
  device_id text not null references phone_bridge_devices (id) on delete cascade,
  snapshot_hash text not null default '',
  battery_percent integer,
  battery_charging boolean,
  storage_available_bytes bigint,
  storage_total_bytes bigint,
  ram_available_bytes bigint,
  ram_total_bytes bigint,
  queue_queued integer,
  queue_dead_letters integer,
  received_at timestamptz not null default current_timestamp
);

create index if not exists phone_bridge_heartbeats_device_idx
  on phone_bridge_heartbeats (device_id, received_at desc);

-- ---------------------------------------------------------------------------
-- Remote commands
--
-- lifecycle: queued -> delivered -> running -> succeeded | failed | expired
-- ---------------------------------------------------------------------------

create table if not exists phone_bridge_commands (
  id text primary key,
  device_id text not null references phone_bridge_devices (id) on delete cascade,
  module text not null default '',
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  requested_by text not null default '',
  requested_at timestamptz not null default current_timestamp,
  expires_at timestamptz,
  status text not null default 'queued',
  delivered_at timestamptz,
  finished_at timestamptz,
  result jsonb,
  error text,
  audit_id text
);

-- A command is delivered at most once. The unique index on (id, device_id) is
-- what the claiming UPDATE keys on, so two pollers can never both win the same
-- row even if they read it concurrently.
create index if not exists phone_bridge_commands_pending_idx
  on phone_bridge_commands (device_id, requested_at)
  where status in ('queued', 'delivered', 'running');
create index if not exists phone_bridge_commands_device_idx
  on phone_bridge_commands (device_id, requested_at desc);

-- ---------------------------------------------------------------------------
-- Audit trail
--
-- Every sensitive action lands here with who / device / action / result / ip /
-- user agent. Tokens and secrets are never stored in this table.
-- ---------------------------------------------------------------------------

create table if not exists phone_bridge_audit_log (
  id bigserial primary key,
  device_id text,
  actor text not null default '',
  action text not null,
  module text not null default '',
  result text not null default 'ok',
  policy text not null default '',
  ip text not null default '',
  user_agent text not null default '',
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default current_timestamp
);

create index if not exists phone_bridge_audit_log_device_idx
  on phone_bridge_audit_log (device_id, created_at desc);
create index if not exists phone_bridge_audit_log_action_idx
  on phone_bridge_audit_log (action, created_at desc);