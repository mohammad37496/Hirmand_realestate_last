-- Store the property's site orientation/position as a normalized value.
alter table if exists properties
  add column if not exists orientation text;

alter table if exists properties
  drop constraint if exists properties_orientation_check;

alter table if exists properties
  add constraint properties_orientation_check
  check (
    orientation is null
    or orientation in (
      'north',
      'south',
      'east',
      'west',
      'northeast',
      'northwest',
      'southeast',
      'southwest',
      'two_fronts',
      'three_fronts',
      'four_fronts',
      'other'
    )
  );

create index if not exists properties_orientation_idx
  on properties (orientation)
  where orientation is not null;

alter table if exists divar_files
  add column if not exists orientation text;

alter table if exists divar_files
  drop constraint if exists divar_files_orientation_check;

alter table if exists divar_files
  add constraint divar_files_orientation_check
  check (
    orientation is null
    or orientation in (
      'north',
      'south',
      'east',
      'west',
      'northeast',
      'northwest',
      'southeast',
      'southwest',
      'two_fronts',
      'three_fronts',
      'four_fronts',
      'other'
    )
  );

create index if not exists divar_files_orientation_idx
  on divar_files (orientation)
  where orientation is not null;
