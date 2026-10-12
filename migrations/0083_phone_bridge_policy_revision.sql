-- Phone Bridge: policy revisions force a fresh snapshot after access-policy changes.

alter table phone_bridge_devices
  add column if not exists policy_revision integer not null default 1,
  add column if not exists last_snapshot_policy_revision integer not null default 1;

create index if not exists phone_bridge_devices_policy_revision_idx
  on phone_bridge_devices(policy_revision, last_snapshot_policy_revision);
