-- Server-side property watch subscriptions and persisted change alerts.
create table if not exists property_watch_subscriptions (
  id bigserial primary key,
  visitor_id text not null,
  property_id text not null,
  property_slug text not null,
  price numeric(20,0),
  deposit numeric(20,0),
  rent numeric(20,0),
  availability_status text not null default 'available',
  enabled boolean not null default true,
  last_notified_at timestamptz,
  created_at timestamptz not null default current_timestamp,
  updated_at timestamptz not null default current_timestamp,
  unique (visitor_id, property_id)
);

create index if not exists property_watch_subscriptions_visitor_idx
  on property_watch_subscriptions (visitor_id, enabled, updated_at desc);

create index if not exists property_watch_subscriptions_property_idx
  on property_watch_subscriptions (property_id, enabled, updated_at desc);

create table if not exists property_watch_alerts (
  id bigserial primary key,
  visitor_id text not null,
  property_id text not null,
  property_slug text not null,
  alert_type text not null check (alert_type in ('price_drop','price_change','availability_change')),
  previous_price numeric(20,0),
  current_price numeric(20,0),
  previous_deposit numeric(20,0),
  current_deposit numeric(20,0),
  previous_rent numeric(20,0),
  current_rent numeric(20,0),
  previous_availability text,
  current_availability text,
  message text not null,
  created_at timestamptz not null default current_timestamp,
  seen_at timestamptz
);

create index if not exists property_watch_alerts_visitor_idx
  on property_watch_alerts (visitor_id, seen_at, created_at desc);
