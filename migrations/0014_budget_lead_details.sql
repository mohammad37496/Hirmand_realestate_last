-- Structured CRM data for budget-matching requests.
alter table leads
  add column if not exists budget_deposit numeric(20,0),
  add column if not exists budget_rent numeric(20,0),
  add column if not exists budget_rate numeric(12,0),
  add column if not exists budget_equivalent numeric(20,2),
  add column if not exists budget_bedrooms smallint,
  add column if not exists matched_properties jsonb not null default '[]'::jsonb,
  add column if not exists match_count integer not null default 0;

create index if not exists leads_budget_created_idx on leads (budget_deposit, budget_rent, created_at desc);
create index if not exists leads_source_created_idx on leads (source, created_at desc);