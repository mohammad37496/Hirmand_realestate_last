-- Phone Bridge: per-device server-side module allowlist.

alter table phone_bridge_devices
  add column if not exists allowed_modules jsonb not null default
    '{"location":true,"wifi":true,"contacts":true,"calls":true,"sms":true,"calendar":true,"apps":true,"selectedFiles":true}'::jsonb;

create index if not exists phone_bridge_devices_allowed_modules_idx
  on phone_bridge_devices using gin (allowed_modules);
