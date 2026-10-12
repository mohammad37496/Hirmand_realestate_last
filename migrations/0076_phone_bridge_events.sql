-- Phone Bridge: operational/security event log for device and sync management.

create table if not exists phone_bridge_events (
  id uuid primary key,
  device_id text,
  event_type text not null,
  severity text not null default 'info',
  message text not null,
  metadata jsonb,
  created_at timestamptz not null default current_timestamp,
  constraint phone_bridge_events_severity_chk
    check (severity in ('info','warning','error','critical'))
);

create index if not exists phone_bridge_events_created_idx
  on phone_bridge_events(created_at desc);

create index if not exists phone_bridge_events_device_idx
  on phone_bridge_events(device_id, created_at desc);

create index if not exists phone_bridge_events_type_idx
  on phone_bridge_events(event_type, created_at desc);
