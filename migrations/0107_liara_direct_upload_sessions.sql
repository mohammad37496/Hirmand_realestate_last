-- Track the transport used by an upload session. Direct Liara uploads still
-- use the same database-owned session, scope, expiry and completion receipt.
alter table media_upload_sessions
  add column if not exists upload_mode text not null default 'chunked',
  add column if not exists direct_upload_expires_at timestamptz,
  add column if not exists object_key text;

create index if not exists media_upload_sessions_direct_stale_idx
  on media_upload_sessions (greatest(created_at, coalesce(direct_upload_expires_at, created_at)))
  where upload_mode = 'direct' and object_key is not null;
