create table if not exists divar_files (
  id text primary key,
  token text not null unique,
  title text not null,
  transaction_type text not null check (transaction_type in ('sell', 'rent')),
  property_type text not null check (property_type in ('apartment', 'villa')),
  neighborhood text not null default 'اصفهان',

  area_m2 integer,
  bedrooms smallint,
  bathrooms smallint,
  floor smallint,
  total_floors smallint,
  built_year smallint,

  parking boolean not null default false,
  elevator boolean not null default false,
  storage boolean not null default false,

  price numeric(20,0),
  deposit numeric(20,0),
  rent numeric(20,0),

  description text not null default '',
  features jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,

  seller_name text,
  seller_type text,
  source_url text not null,

  filter_status text not null default 'accepted'
    check (filter_status in ('accepted', 'imported', 'rejected')),
  reject_reason text,

  imported_property_id text,
  imported_at timestamptz,

  last_seen_at timestamptz not null default current_timestamp,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists divar_files_status_idx
  on divar_files (filter_status, last_seen_at desc);

create index if not exists divar_files_seen_idx
  on divar_files (last_seen_at desc);

create index if not exists divar_files_imported_property_idx
  on divar_files (imported_property_id)
  where imported_property_id is not null;
