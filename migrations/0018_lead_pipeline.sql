-- Expand CRM lead states into a practical sales pipeline.
alter table leads drop constraint if exists leads_status_check;
alter table leads
  add constraint leads_status_check
  check (status in ('new','contacted','follow_up','visited','contract','closed','spam'));

drop index if exists leads_follow_up_idx;
create index if not exists leads_follow_up_idx
  on leads (follow_up_at asc, status, created_at desc)
  where status in ('new', 'contacted', 'follow_up', 'visited', 'contract');


update leads
set follow_up_at = coalesce(follow_up_at, created_at + interval '24 hours')
where status in ('new', 'contacted', 'follow_up', 'visited', 'contract')
  and follow_up_at is null;
