create table if not exists properties (
  id text primary key,
  slug text not null unique,
  status text not null default 'published' check (status in ('draft', 'published', 'archived')),
  featured boolean not null default false,

  title text not null,
  transaction_type text not null check (transaction_type in ('buy', 'sell', 'rent', 'mortgage')),
  property_type text not null check (property_type in ('apartment', 'villa', 'office', 'heritage', 'land', 'commercial')),
  city text not null default 'اصفهان',
  neighborhood text not null,
  address text,

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

  description text not null,
  features jsonb not null default '[]'::jsonb,
  images jsonb not null default '[]'::jsonb,

  contact_name text not null,
  contact_phone text not null,

  published_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists properties_public_idx
  on properties (status, featured desc, published_at desc, created_at desc);

create index if not exists properties_neighborhood_idx
  on properties (neighborhood);

create index if not exists properties_transaction_idx
  on properties (transaction_type);

create index if not exists properties_property_type_idx
  on properties (property_type);
