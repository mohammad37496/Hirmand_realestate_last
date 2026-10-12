create table if not exists phone_bridge_remote_commands (
  id uuid primary key,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  action text not null,
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','expired')),
  payload jsonb not null default '{}'::jsonb,
  result jsonb,
  error_message text,
  requested_by text,
  created_at timestamptz not null default current_timestamp,
  started_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null default (current_timestamp + interval '60 seconds')
);

create index if not exists phone_bridge_remote_commands_device_status_idx
  on phone_bridge_remote_commands(device_id, status, created_at);

create index if not exists phone_bridge_remote_commands_device_created_idx
  on phone_bridge_remote_commands(device_id, created_at desc);
