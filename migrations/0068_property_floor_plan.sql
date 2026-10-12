-- 0068: keep an optional real architectural floor plan separate from the gallery.
alter table properties
  add column if not exists floor_plan_url text not null default '';

comment on column properties.floor_plan_url is
  'Optional property-specific floor plan image URL; separate from gallery media.';