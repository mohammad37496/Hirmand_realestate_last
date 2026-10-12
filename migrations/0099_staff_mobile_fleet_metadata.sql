-- Mobile Fleet Management metadata for the independent staff app.
alter table staff_mobile_devices
  add column if not exists management_mode text not null default 'unknown',
  add column if not exists manufacturer text not null default '',
  add column if not exists model text not null default '',
  add column if not exists android_version text not null default '',
  add column if not exists sdk_int integer,
  add column if not exists last_sync_at timestamptz;

update staff_mobile_devices
set management_mode = 'unknown'
where management_mode is null or management_mode = '';

create index if not exists staff_mobile_devices_management_idx
  on staff_mobile_devices (management_mode, updated_at desc);

create index if not exists staff_mobile_devices_last_seen_idx
  on staff_mobile_devices (last_seen_at desc);
