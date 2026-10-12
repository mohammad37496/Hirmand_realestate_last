-- Optional virtual-tour URL for public property listings.
alter table properties
  add column if not exists virtual_tour_url text not null default '';
