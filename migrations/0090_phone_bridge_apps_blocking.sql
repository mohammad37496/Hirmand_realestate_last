create table if not exists phone_bridge_apps (
  id uuid primary key,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  package_name text not null,
  label text not null default '',
  activity text not null default '',
  version_name text not null default '',
  first_install_at timestamptz,
  last_update_at timestamptz,
  is_system_app boolean not null default false,
  enabled boolean not null default true,
  last_seen_at timestamptz not null default current_timestamp,
  unique(device_id, package_name)
);

create index if not exists phone_bridge_apps_device_label_idx on phone_bridge_apps(device_id, label);
create index if not exists phone_bridge_apps_device_seen_idx on phone_bridge_apps(device_id, last_seen_at desc);

create table if not exists phone_bridge_app_block_rules (
  id uuid primary key,
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  package_name text not null,
  label text not null default '',
  enabled boolean not null default true,
  days jsonb not null default '[0,1,2,3,4,5,6]'::jsonb,
  start_time time not null,
  end_time time not null,
  start_date date,
  end_date date,
  message text not null default '',
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique(device_id, package_name)
);

create index if not exists phone_bridge_app_block_rules_device_enabled_idx on phone_bridge_app_block_rules(device_id, enabled);
create index if not exists phone_bridge_app_block_rules_device_updated_idx on phone_bridge_app_block_rules(device_id, updated_at desc);