-- Price-target alerts for watched properties and server-backed shareable shortlists.

alter table property_watch_subscriptions
  add column if not exists target_price numeric(20,0),
  add column if not exists target_deposit numeric(20,0),
  add column if not exists target_rent numeric(20,0);

alter table property_watch_alerts
  drop constraint if exists property_watch_alerts_alert_type_check;

alter table property_watch_alerts
  add constraint property_watch_alerts_alert_type_check
  check (alert_type in ('price_drop','price_change','availability_change','target_reached'));

create table if not exists shared_shortlists (
  id bigserial primary key,
  token text not null unique,
  title text not null default 'سبد منتخب هیرمند',
  property_slugs jsonb not null,
  created_at timestamptz not null default current_timestamp,
  expires_at timestamptz not null,
  view_count integer not null default 0
);

create index if not exists shared_shortlists_expires_idx
  on shared_shortlists (expires_at desc);
