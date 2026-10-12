-- Track price changes so public listings can highlight genuine reductions.
alter table properties
  add column if not exists previous_price numeric(20,0),
  add column if not exists previous_deposit numeric(20,0),
  add column if not exists previous_rent numeric(20,0),
  add column if not exists price_changed_at timestamptz,
  add column if not exists price_drop_percent numeric(7,2);

create index if not exists properties_price_drop_idx
  on properties (price_drop_percent desc, price_changed_at desc)
  where status = 'published' and price_drop_percent is not null;

-- Give every new CRM lead a concrete follow-up target.
alter table leads
  add column if not exists follow_up_at timestamptz,
  add column if not exists last_contacted_at timestamptz;

create index if not exists leads_follow_up_idx
  on leads (follow_up_at asc, status, created_at desc)
  where status in ('new', 'contacted');

update leads
set follow_up_at = coalesce(follow_up_at, created_at + interval '24 hours')
where status in ('new', 'contacted') and follow_up_at is null;
