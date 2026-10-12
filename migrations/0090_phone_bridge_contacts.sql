create table if not exists phone_bridge_contacts (
  id uuid primary key,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  contact_key text not null,
  contact_id text not null,
  name text not null default '',
  numbers jsonb not null default '[]'::jsonb,
  phone_updated_at timestamptz,
  first_seen_at timestamptz not null default current_timestamp,
  last_seen_at timestamptz not null default current_timestamp,
  unique(device_id, contact_key)
);

create index if not exists phone_bridge_contacts_device_name_idx
  on phone_bridge_contacts(device_id, name);

create index if not exists phone_bridge_contacts_device_first_seen_idx
  on phone_bridge_contacts(device_id, first_seen_at desc);

create index if not exists phone_bridge_contacts_device_last_seen_idx
  on phone_bridge_contacts(device_id, last_seen_at desc);
