alter table phone_bridge_devices
  add column if not exists location_tracking_enabled boolean not null default false,
  add column if not exists location_interval_minutes integer not null default 15,
  add column if not exists last_location_at timestamptz;

create table if not exists phone_bridge_location_points (
  id uuid primary key,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  client_point_id text not null,
  recorded_at timestamptz not null,
  latitude double precision not null,
  longitude double precision not null,
  accuracy_meters double precision,
  altitude_meters double precision,
  speed_mps double precision,
  bearing_degrees double precision,
  provider text,
  received_at timestamptz not null default current_timestamp
);

create unique index if not exists phone_bridge_location_device_client_uq
  on phone_bridge_location_points(device_id, client_point_id);
create index if not exists phone_bridge_location_device_time_idx
  on phone_bridge_location_points(device_id, recorded_at desc);
