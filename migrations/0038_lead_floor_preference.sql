-- Store the requested floor independently so CRM, exports, and follow-up tooling can use it.
alter table leads
  add column if not exists floor_preference text not null default '';

create index if not exists leads_floor_preference_idx on leads (floor_preference);
