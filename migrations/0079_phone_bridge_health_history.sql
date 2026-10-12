-- Phone Bridge: historical health samples for trend analysis.

create table if not exists phone_bridge_health_history (
  id bigserial primary key,
  device_id text not null,
  recorded_at timestamptz not null default current_timestamp,
  battery_percent integer,
  battery_charging boolean,
  storage_available_bytes bigint,
  storage_total_bytes bigint,
  ram_available_bytes bigint,
  ram_total_bytes bigint,
  queued_packets integer not null default 0,
  dead_letter_packets integer not null default 0,
  source text not null default 'heartbeat'
);

create index if not exists phone_bridge_health_history_device_time_idx
  on phone_bridge_health_history(device_id, recorded_at desc);

create index if not exists phone_bridge_health_history_time_idx
  on phone_bridge_health_history(recorded_at desc);
