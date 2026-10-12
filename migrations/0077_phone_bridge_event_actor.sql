-- Phone Bridge: attach admin account/session identity to audited management actions.

alter table phone_bridge_events
  add column if not exists actor_account_id text;

create index if not exists phone_bridge_events_actor_idx
  on phone_bridge_events(actor_account_id, created_at desc);
