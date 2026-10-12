-- Add a semantic special-floor value without overloading the numeric floor column.
alter table if exists properties
  add column if not exists floor_label text;

alter table if exists properties
  drop constraint if exists properties_floor_label_check;

alter table if exists properties
  add constraint properties_floor_label_check
  check (floor_label is null or floor_label in ('suite'));

create index if not exists properties_floor_label_idx
  on properties (floor_label)
  where floor_label is not null;

alter table if exists divar_files
  add column if not exists floor_label text;

alter table if exists divar_files
  drop constraint if exists divar_files_floor_label_check;

alter table if exists divar_files
  add constraint divar_files_floor_label_check
  check (floor_label is null or floor_label in ('suite'));

create index if not exists divar_files_floor_label_idx
  on divar_files (floor_label)
  where floor_label is not null;
