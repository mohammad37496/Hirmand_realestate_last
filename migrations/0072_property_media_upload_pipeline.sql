-- Dedicated, isolated staging for property images, videos, and floor plans.
-- Keep the published media_objects table and delivery URLs unchanged so existing
-- property records remain readable during and after the upload-pipeline migration.
create table if not exists property_media_upload_sessions (
  id text primary key,
  pathname text not null,
  original_filename text not null default '',
  content_type text not null,
  asset_kind text not null check (asset_kind in ('gallery', 'floor-plan')),
  total_chunks integer not null check (total_chunks > 0),
  total_bytes integer not null check (total_bytes > 0),
  received_chunks integer not null default 0,
  bytes_received integer not null default 0,
  state text not null default 'pending' check (state in ('pending', 'completing', 'completed', 'failed')),
  completion_started_at timestamptz,
  stored_url text,
  stored_storage text,
  stored_media_id text,
  completion_result jsonb,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists property_media_upload_sessions_created_idx
  on property_media_upload_sessions (created_at desc);
create index if not exists property_media_upload_sessions_state_idx
  on property_media_upload_sessions (state, completion_started_at);

create table if not exists property_media_upload_chunks (
  upload_id text not null references property_media_upload_sessions (id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  data bytea not null,
  primary key (upload_id, chunk_index)
);
