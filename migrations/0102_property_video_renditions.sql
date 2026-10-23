-- Map a video's highest available rendition to the lower-quality files generated at upload.
-- This keeps the existing property.images URL contract intact.
create table if not exists property_video_renditions (
  source_url text primary key,
  renditions jsonb not null check (jsonb_typeof(renditions) = 'object'),
  created_at timestamptz not null default current_timestamp
);

create index if not exists property_video_renditions_created_idx
  on property_video_renditions (created_at desc);
