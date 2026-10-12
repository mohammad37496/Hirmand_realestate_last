-- Store the requested bedroom count separately from free-form lead notes.
alter table leads
  add column if not exists requested_bedrooms smallint;

create index if not exists leads_requested_bedrooms_created_idx
  on leads (requested_bedrooms, created_at desc);
