create table if not exists site_content_items (
  id text primary key,
  kind text not null check (kind in ('guide','faq')),
  category text not null default '',
  title text not null,
  summary text not null default '',
  body jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp
);

create index if not exists site_content_items_public_idx
  on site_content_items (kind, active, sort_order, updated_at desc);
