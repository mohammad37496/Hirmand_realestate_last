-- Allow featured property placement to expire automatically without a cron job.
alter table properties
  add column if not exists featured_until timestamptz;

create index if not exists properties_featured_active_idx
  on properties (featured, featured_until, published_at desc)
  where status = 'published';
