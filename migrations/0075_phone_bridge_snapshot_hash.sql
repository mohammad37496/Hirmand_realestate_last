-- Phone Bridge: remember the last content snapshot hash for delta/heartbeat sync.

alter table phone_bridge_devices
  add column if not exists last_snapshot_hash text;

create index if not exists phone_bridge_devices_snapshot_hash_idx
  on phone_bridge_devices(last_snapshot_hash);
