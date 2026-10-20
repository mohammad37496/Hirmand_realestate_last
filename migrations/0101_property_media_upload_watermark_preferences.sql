-- Per-upload watermark preference for property gallery media.
-- Defaults to false so existing clients and uploads remain unchanged.
alter table property_media_upload_sessions
  add column if not exists watermark_enabled boolean not null default false;

alter table property_media_upload_sessions
  add column if not exists watermark_position text not null default 'bottom-right'
  check (watermark_position in ('top-left', 'top-right', 'bottom-left', 'bottom-right'));
