create table if not exists phone_bridge_remote_photos (
  id uuid primary key,
  command_id uuid not null unique references phone_bridge_remote_commands(id) on delete cascade,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  camera text not null check (camera in ('front','rear')),
  flash boolean not null default false,
  mime_type text not null default 'image/jpeg',
  data bytea not null,
  captured_at timestamptz not null default current_timestamp,
  created_at timestamptz not null default current_timestamp
);

create index if not exists phone_bridge_remote_photos_device_idx
  on phone_bridge_remote_photos(device_id, created_at desc);
