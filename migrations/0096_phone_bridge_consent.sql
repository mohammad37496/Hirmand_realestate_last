-- Phone Bridge: explicit in-app consent record.
-- The record documents what the device owner/user approved. It does not grant
-- Android runtime permissions and must never be treated as a bypass for them.

alter table phone_bridge_devices
  add column if not exists consent_version integer not null default 0,
  add column if not exists consent_accepted_at timestamptz,
  add column if not exists consent_scopes jsonb not null default '[]'::jsonb,
  add column if not exists consent_revoked_at timestamptz;

create index if not exists phone_bridge_devices_consent_idx
  on phone_bridge_devices(consent_version, consent_accepted_at desc);
