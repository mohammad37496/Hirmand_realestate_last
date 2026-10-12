-- Persistent music library for the Hirmand website.
create table if not exists music_tracks (
  id text primary key,
  title text not null,
  artist text not null default '',
  url text not null,
  mime_type text not null,
  size_bytes integer not null default 0,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists music_tracks_active_position_idx
  on music_tracks (active, position, created_at);

create or replace function music_tracks_set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = current_timestamp; return new; end;
$$;

drop trigger if exists music_tracks_updated_at_trg on music_tracks;
create trigger music_tracks_updated_at_trg
  before update on music_tracks
  for each row execute function music_tracks_set_updated_at();