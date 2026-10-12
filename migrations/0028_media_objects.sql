-- Database-backed media store.
--
-- Uploaded audio and imported Divar imagery used to depend entirely on an
-- external object store. When that store was missing or unreachable the audio
-- upload stalled and property images silently went missing. These tables let the
-- app keep the bytes itself so media always publishes and always plays, with the
-- object store used only as an optional accelerator.

create table if not exists media_objects (
  id text primary key,
  pathname text not null,
  content_type text not null default 'application/octet-stream',
  size_bytes integer not null default 0,
  data bytea not null,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists media_objects_pathname_idx on media_objects (pathname);
create index if not exists media_objects_created_idx on media_objects (created_at desc);

-- Chunked upload staging. Browsers post one slice at a time so a large audio
-- file never has to fit in a single request body; rows are removed once the
-- assembled object lands in media_objects.
create table if not exists media_upload_sessions (
  id text primary key,
  pathname text not null,
  content_type text not null,
  title text not null default '',
  artist text not null default '',
  total_chunks integer not null,
  received_chunks integer not null default 0,
  bytes_received integer not null default 0,
  total_bytes integer not null default 0,
  kind text not null default 'audio',
  created_at timestamptz not null default current_timestamp
);

create index if not exists media_upload_sessions_created_idx
  on media_upload_sessions (created_at desc);

create table if not exists media_upload_chunks (
  session_id text not null references media_upload_sessions (id) on delete cascade,
  chunk_index integer not null,
  data bytea not null,
  primary key (session_id, chunk_index)
);
