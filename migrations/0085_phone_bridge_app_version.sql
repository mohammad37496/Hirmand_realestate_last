-- Phone Bridge: track app version and minimum version allowed per device.

alter table phone_bridge_devices
  add column if not exists app_version_name text not null default '',
  add column if not exists app_version_code integer not null default 1,
  add column if not exists min_app_version_code integer not null default 0;

create index if not exists phone_bridge_devices_app_version_idx
  on phone_bridge_devices(app_version_code, min_app_version_code);
