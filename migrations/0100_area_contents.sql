-- Editorial content for every neighborhood page; the area catalog itself remains
-- sourced from the site's bundled and synchronized neighborhood directory.
create table if not exists area_contents (
  slug text primary key,
  area_name text not null,
  group_title text not null default '',
  intro text not null default '',
  about text not null default '',
  highlights text not null default '',
  amenities text not null default '',
  transportation text not null default '',
  market_note text not null default '',
  hero_image text not null default '',
  gallery jsonb not null default '[]'::jsonb
    check (jsonb_typeof(gallery) = 'array'),
  seo_title text not null default '',
  seo_description text not null default '',
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists area_contents_public_group_idx
  on area_contents (is_published, group_title, area_name);

create index if not exists area_contents_updated_at_idx
  on area_contents (updated_at desc);
