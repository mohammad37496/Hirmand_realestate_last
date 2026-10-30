-- Structured minimum/maximum area preferences used by customer-to-property matching.
alter table leads
  add column if not exists requested_area_min integer,
  add column if not exists requested_area_max integer;

create index if not exists leads_requested_area_range_created_idx
  on leads (requested_area_min, requested_area_max, created_at desc);
