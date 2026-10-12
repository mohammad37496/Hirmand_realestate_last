-- Detailed analytics: page-level views and anonymous business events.
create table if not exists site_page_days (
  day date not null,
  visitor_id text not null,
  path text not null,
  pageviews integer not null default 1,
  last_seen_at timestamptz not null default current_timestamp,
  primary key (day, visitor_id, path)
);

create index if not exists site_page_days_day_path_idx
  on site_page_days (day desc, pageviews desc);

create table if not exists site_events (
  id text primary key,
  day date not null,
  visitor_id text not null,
  event_name text not null,
  path text not null,
  property_slug text,
  created_at timestamptz not null default current_timestamp
);

create index if not exists site_events_day_event_idx
  on site_events (day desc, event_name);

create index if not exists site_events_property_idx
  on site_events (property_slug, event_name, day desc);
