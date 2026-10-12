-- Structured property visit requests
alter table leads
  add column if not exists property_id text,
  add column if not exists visit_preferred_at timestamptz,
  add column if not exists visit_requested_at timestamptz,
  add column if not exists visit_status text not null default 'none';

update leads
set visit_status = 'none'
where visit_status is null;

alter table leads
  drop constraint if exists leads_visit_status_check;

alter table leads
  add constraint leads_visit_status_check
  check (visit_status in ('none','requested','confirmed','completed','cancelled'));

create index if not exists leads_visit_queue_idx
  on leads (visit_status, visit_preferred_at, created_at desc);

create index if not exists leads_property_id_idx
  on leads (property_id);
