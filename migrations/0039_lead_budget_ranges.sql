-- Store user-entered budget ranges while keeping legacy budget columns usable for matching.
alter table leads
  add column if not exists budget_deposit_min numeric(20,0),
  add column if not exists budget_deposit_max numeric(20,0),
  add column if not exists budget_rent_min numeric(20,0),
  add column if not exists budget_rent_max numeric(20,0),
  add column if not exists budget_purchase_min numeric(20,0),
  add column if not exists budget_purchase_max numeric(20,0),
  add column if not exists budget_sale_min numeric(20,0),
  add column if not exists budget_sale_max numeric(20,0);

create index if not exists leads_budget_range_created_idx
  on leads (budget_deposit_max, budget_rent_max, budget_purchase_max, budget_sale_max, created_at desc);
