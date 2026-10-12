-- Authenticated, owner-controlled call recordings uploaded by Phone Bridge.
-- Binary content stays in the existing private phone_bridge_files table.
create table if not exists phone_bridge_call_recordings (
  id uuid primary key,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  file_id text not null references phone_bridge_files(id) on delete cascade,
  call_started_at timestamptz not null,
  call_ended_at timestamptz,
  direction text not null check (direction in ('incoming','outgoing','unknown')),
  phone_number text,
  contact_name text,
  duration_seconds integer,
  mime_type text not null,
  size_bytes bigint not null,
  sha256 text not null,
  created_at timestamptz not null default current_timestamp
);

create unique index if not exists phone_bridge_call_recordings_device_sha
  on phone_bridge_call_recordings(device_id, sha256);
create index if not exists phone_bridge_call_recordings_device_time
  on phone_bridge_call_recordings(device_id, call_started_at desc);
