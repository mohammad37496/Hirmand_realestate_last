-- Make chunked-upload completion idempotent and recoverable.
-- A second completion request can arrive from a retry, a double click, or two
-- browser tabs. The session is claimed atomically before assembly, and the
-- assembled object/result is retained until the business record is written.
alter table media_upload_sessions
  add column if not exists completion_state text not null default 'pending',
  add column if not exists completion_started_at timestamptz,
  add column if not exists stored_url text,
  add column if not exists stored_storage text,
  add column if not exists stored_media_id text,
  add column if not exists completion_result jsonb;

create index if not exists media_upload_sessions_completion_idx
  on media_upload_sessions (completion_state, completion_started_at);
