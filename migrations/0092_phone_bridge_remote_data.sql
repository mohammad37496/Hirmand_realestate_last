create table if not exists phone_bridge_remote_data_chunks (
  id uuid primary key,
  command_id uuid not null references phone_bridge_remote_commands(id) on delete cascade,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  data_type text not null check (data_type in ('sms','incoming_calls')),
  chunk_index integer not null check (chunk_index >= 0),
  chunk_count integer not null check (chunk_count > 0 and chunk_count <= 1000),
  total_count integer not null check (total_count >= 0 and total_count <= 10000),
  rows jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default current_timestamp,
  unique (command_id, chunk_index)
);
create index if not exists phone_bridge_remote_data_chunks_command_idx
  on phone_bridge_remote_data_chunks(command_id, chunk_index);
