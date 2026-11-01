-- Serialize every persisted media-reference mutation with physical media deletion.
-- The single advisory key is intentionally coarse: correctness is more important
-- than parallel writes to this small set of owner tables.
create table if not exists media_cleanup_jobs (
  id bigserial primary key,
  media_url text not null unique,
  liara_key text,
  reference_tokens text[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'deleting', 'completed', 'retained')),
  attempts integer not null default 0,
  last_error text,
  next_attempt_at timestamptz not null default current_timestamp,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists media_cleanup_jobs_retry_idx
  on media_cleanup_jobs (next_attempt_at, id) where status in ('pending', 'deleting', 'retained');

create or replace function hirmand_lock_media_reference_writes()
returns trigger
language plpgsql
as $$
begin
  perform pg_advisory_xact_lock(74120261101::bigint);
  return null;
end;
$$;

create or replace function hirmand_reject_deleted_media_reference()
returns trigger
language plpgsql
as $$
declare payload text;
begin
  payload := to_jsonb(new)::text;
  if exists (
    select 1
    from media_cleanup_jobs j
    cross join unnest(j.reference_tokens) as refs(token)
    where j.status in ('deleting', 'completed')
      and token <> ''
      and position(token in payload) > 0
  ) then
    raise exception using
      errcode = '23503',
      message = 'A media object that has already been deleted cannot be referenced again';
  end if;

  return new;
end;
$$;

drop trigger if exists properties_media_reference_lock on properties;
create trigger properties_media_reference_lock before insert or update or delete on properties
for each statement execute function hirmand_lock_media_reference_writes();
drop trigger if exists properties_media_reference_tombstone on properties;
create trigger properties_media_reference_tombstone before insert or update on properties
for each row execute function hirmand_reject_deleted_media_reference();

drop trigger if exists music_tracks_media_reference_lock on music_tracks;
create trigger music_tracks_media_reference_lock before insert or update or delete on music_tracks
for each statement execute function hirmand_lock_media_reference_writes();
drop trigger if exists music_tracks_media_reference_tombstone on music_tracks;
create trigger music_tracks_media_reference_tombstone before insert or update on music_tracks
for each row execute function hirmand_reject_deleted_media_reference();

drop trigger if exists submissions_media_reference_lock on customer_property_submissions;
create trigger submissions_media_reference_lock before insert or update or delete on customer_property_submissions
for each statement execute function hirmand_lock_media_reference_writes();
drop trigger if exists submissions_media_reference_tombstone on customer_property_submissions;
create trigger submissions_media_reference_tombstone before insert or update on customer_property_submissions
for each row execute function hirmand_reject_deleted_media_reference();

drop trigger if exists deal_documents_media_reference_lock on admin_deal_documents;
create trigger deal_documents_media_reference_lock before insert or update or delete on admin_deal_documents
for each statement execute function hirmand_lock_media_reference_writes();
drop trigger if exists deal_documents_media_reference_tombstone on admin_deal_documents;
create trigger deal_documents_media_reference_tombstone before insert or update on admin_deal_documents
for each row execute function hirmand_reject_deleted_media_reference();

drop trigger if exists video_renditions_media_reference_lock on property_video_renditions;
create trigger video_renditions_media_reference_lock before insert or update or delete on property_video_renditions
for each statement execute function hirmand_lock_media_reference_writes();
drop trigger if exists video_renditions_media_reference_tombstone on property_video_renditions;
create trigger video_renditions_media_reference_tombstone before insert or update on property_video_renditions
for each row execute function hirmand_reject_deleted_media_reference();

drop trigger if exists property_upload_sessions_media_reference_lock on property_media_upload_sessions;
create trigger property_upload_sessions_media_reference_lock before insert or update or delete on property_media_upload_sessions
for each statement execute function hirmand_lock_media_reference_writes();
drop trigger if exists property_upload_sessions_media_reference_tombstone on property_media_upload_sessions;
create trigger property_upload_sessions_media_reference_tombstone before insert or update on property_media_upload_sessions
for each row execute function hirmand_reject_deleted_media_reference();

drop trigger if exists upload_sessions_media_reference_lock on media_upload_sessions;
create trigger upload_sessions_media_reference_lock before insert or update or delete on media_upload_sessions
for each statement execute function hirmand_lock_media_reference_writes();
drop trigger if exists upload_sessions_media_reference_tombstone on media_upload_sessions;
create trigger upload_sessions_media_reference_tombstone before insert or update on media_upload_sessions
for each row execute function hirmand_reject_deleted_media_reference();

drop trigger if exists area_contents_media_reference_lock on area_contents;
create trigger area_contents_media_reference_lock before insert or update or delete on area_contents
for each statement execute function hirmand_lock_media_reference_writes();
drop trigger if exists area_contents_media_reference_tombstone on area_contents;
create trigger area_contents_media_reference_tombstone before insert or update on area_contents
for each row execute function hirmand_reject_deleted_media_reference();
