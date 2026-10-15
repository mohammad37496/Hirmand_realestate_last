-- Lossless catalog of Divar's own Isfahan neighborhood geometry.
-- Divar bbox is stored as [west, south, east, north]. Polygon fields remain
-- empty when Divar itself returns no polygon; never build one from a bbox.

create table if not exists divar_neighborhood_catalog (
  city_id text not null,
  district_id text not null,
  name text not null,
  slug text not null,
  second_slug text,
  center_lat double precision not null,
  center_lng double precision not null,
  default_location jsonb not null,
  centroid jsonb,
  bbox jsonb not null,
  neighbors jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  polygon_encoded text not null default '',
  multi_polygon_encoded jsonb not null default '[]'::jsonb,
  multi_polygon jsonb not null default '[]'::jsonb,
  source_payload jsonb not null,
  source_updated_at timestamptz not null default now(),
  is_active boolean not null default true,
  primary key (city_id, district_id)
);
create index if not exists divar_neighborhood_catalog_active_name_idx
  on divar_neighborhood_catalog (city_id, is_active, name);
create index if not exists divar_neighborhood_catalog_location_idx
  on divar_neighborhood_catalog (city_id, center_lat, center_lng)
  where is_active = true;
create index if not exists divar_neighborhood_catalog_slug_idx
  on divar_neighborhood_catalog (city_id, slug)
  where is_active = true;
