-- Phone Bridge: acknowledgeable smart alerts with admin audit trail.

create table if not exists phone_bridge_alert_acknowledgements (
  alert_id text primary key,
  device_id text,
  acknowledged_at timestamptz not null default current_timestamp,
  actor_account_id text,
  note text
);

create index if not exists phone_bridge_alert_ack_device_idx
  on phone_bridge_alert_acknowledgements(device_id, acknowledged_at desc);
