-- Phone Bridge: latest client-side queue/health counters for smart alerts.

alter table phone_bridge_devices
  add column if not exists last_queue_count integer not null default 0,
  add column if not exists last_dead_letter_count integer not null default 0,
  add column if not exists last_health_report_at timestamptz;

create index if not exists phone_bridge_devices_dead_letter_idx
  on phone_bridge_devices(last_dead_letter_count, last_health_report_at desc);
