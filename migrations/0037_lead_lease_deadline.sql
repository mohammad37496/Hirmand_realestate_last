-- Deadline for the customer's current mortgage/rental situation.
-- Stored as a date so it stays independent from time zones; the UI presents it in Solar Hijri.
alter table leads
  add column if not exists lease_deadline date;

create index if not exists leads_lease_deadline_idx
  on leads (lease_deadline)
  where lease_deadline is not null;
