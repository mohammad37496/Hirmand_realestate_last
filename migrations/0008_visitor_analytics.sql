-- Anonymous daily visitor analytics.
-- visitor_id is a random first-party cookie value; no IP addresses are stored.
create table if not exists site_visitor_days (
  day date not null,
  visitor_id text not null,
  pageviews integer not null default 1,
  first_path text not null default '/',
  last_path text not null default '/',
  first_seen_at timestamptz not null default current_timestamp,
  last_seen_at timestamptz not null default current_timestamp,
  primary key (day, visitor_id)
);

create index if not exists site_visitor_days_day_idx
  on site_visitor_days (day desc);
