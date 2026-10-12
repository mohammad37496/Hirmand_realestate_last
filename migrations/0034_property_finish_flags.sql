-- Store interior finish flags independently so they can be displayed, exported, and filtered later.
alter table if exists properties
  add column if not exists painted boolean not null default false;

alter table if exists properties
  add column if not exists wallpaper boolean not null default false;

create index if not exists properties_painted_idx
  on properties (painted)
  where painted = true;

create index if not exists properties_wallpaper_idx
  on properties (wallpaper)
  where wallpaper = true;
