-- Phone Bridge: per-device authentication.
-- Existing devices without a token_hash remain compatible with the bootstrap token
-- until they are enrolled again from the app.

alter table phone_bridge_devices
  add column if not exists token_hash text,
  add column if not exists token_created_at timestamptz,
  add column if not exists last_authenticated_at timestamptz;

create unique index if not exists phone_bridge_devices_token_hash_uq
  on phone_bridge_devices(token_hash)
  where token_hash is not null;

create index if not exists phone_bridge_devices_auth_idx
  on phone_bridge_devices(last_authenticated_at desc);
