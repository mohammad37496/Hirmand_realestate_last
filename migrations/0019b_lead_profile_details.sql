-- Additional profile details for property inquiries.
alter table leads
  add column if not exists people_count integer,
  add column if not exists job text not null default '';

create index if not exists leads_people_count_idx on leads (people_count);
