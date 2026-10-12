-- Independent staff-app device registry.
-- Intentionally separate from all legacy Phone Bridge tables.
create table if not exists staff_mobile_devices (
  id text primary key,
  device_id text not null unique,
  staff_id text not null,
  status text not null default 'pending'
    check (status in ('pending','active','revoked')),
  app_version_name text not null default '',
  app_version_code integer not null default 0,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  approved_at timestamptz,
  revoked_at timestamptz,
  last_seen_at timestamptz
);

create index if not exists staff_mobile_devices_staff_idx
  on staff_mobile_devices (staff_id, status, updated_at desc);

create index if not exists staff_mobile_devices_status_idx
  on staff_mobile_devices (status, updated_at desc);
