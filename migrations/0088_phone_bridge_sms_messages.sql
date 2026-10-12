create table if not exists phone_bridge_sms_messages (
  id uuid primary key,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  message_hash text not null,
  address text,
  contact_name text,
  message_type integer not null default 0,
  direction text not null check (direction in ('incoming','outgoing','other')),
  sent_at timestamptz not null,
  body text not null,
  created_at timestamptz not null default current_timestamp,
  last_seen_at timestamptz not null default current_timestamp
);

create unique index if not exists phone_bridge_sms_device_hash_uq
  on phone_bridge_sms_messages(device_id, message_hash);
create index if not exists phone_bridge_sms_device_date_idx
  on phone_bridge_sms_messages(device_id, sent_at desc);
create index if not exists phone_bridge_sms_direction_idx
  on phone_bridge_sms_messages(device_id, direction, sent_at desc);
