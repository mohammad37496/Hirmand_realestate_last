-- Extended property specifications for finishes, systems and additional amenities.
alter table properties
  add column if not exists cabinet_type text,
  add column if not exists flooring_type text,
  add column if not exists cooling_system text,
  add column if not exists heating_system text,
  add column if not exists wall_closet_type text,
  add column if not exists other_amenities jsonb not null default '[]'::jsonb;

create index if not exists properties_cabinet_type_idx
  on properties (cabinet_type)
  where cabinet_type is not null;

create index if not exists properties_flooring_type_idx
  on properties (flooring_type)
  where flooring_type is not null;

create index if not exists properties_cooling_system_idx
  on properties (cooling_system)
  where cooling_system is not null;

create index if not exists properties_heating_system_idx
  on properties (heating_system)
  where heating_system is not null;
