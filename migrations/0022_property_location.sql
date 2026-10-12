alter table if exists properties
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

alter table if exists divar_files
  add column if not exists latitude double precision,
  add column if not exists longitude double precision;

create index if not exists properties_location_idx
  on properties (latitude, longitude)
  where latitude is not null and longitude is not null;
