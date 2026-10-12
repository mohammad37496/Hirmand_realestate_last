-- Mark rental/mortgage listings that may be rebalanced between deposit and monthly rent.
alter table if exists properties
  add column if not exists convertible boolean not null default false;

create index if not exists properties_convertible_idx
  on properties (convertible)
  where convertible = true;
