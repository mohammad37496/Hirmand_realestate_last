create table if not exists phone_bridge_file_entries (
  id text primary key,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  root_uri text not null,
  uri text not null,
  parent_uri text,
  name text not null,
  relative_path text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  modified_at bigint not null default 0,
  is_directory boolean not null default false,
  indexed_at timestamptz not null default current_timestamp
);
create unique index if not exists phone_bridge_file_entries_device_uri_uq on phone_bridge_file_entries(device_id, uri);
create index if not exists phone_bridge_file_entries_device_path_idx on phone_bridge_file_entries(device_id, relative_path);