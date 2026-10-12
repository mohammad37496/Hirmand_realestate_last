-- First-touch acquisition attribution for anonymous visitors.
-- Stores only coarse referrer host + optional UTM campaign fields.
alter table site_visitor_days
  add column if not exists referrer_host text,
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists landing_path text;

create index if not exists site_visitor_days_acquisition_idx
  on site_visitor_days (day desc, utm_source, utm_campaign);

create index if not exists site_visitor_days_referrer_idx
  on site_visitor_days (day desc, referrer_host);
