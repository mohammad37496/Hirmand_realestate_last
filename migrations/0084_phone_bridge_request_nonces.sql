-- Phone Bridge: one-time request nonces for replay protection.

create table if not exists phone_bridge_request_nonces (
  device_id text not null references phone_bridge_devices(id) on delete cascade,
  nonce text not null,
  created_at timestamptz not null default current_timestamp,
  expires_at timestamptz not null,
  primary key (device_id, nonce)
);

create index if not exists phone_bridge_request_nonces_expires_idx
  on phone_bridge_request_nonces(expires_at);
