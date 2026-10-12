-- Store the property features requested by a lead.
alter table leads
  add column if not exists requested_amenities jsonb not null default '[]'::jsonb;

create index if not exists leads_requested_amenities_gin_idx
  on leads using gin (requested_amenities);
