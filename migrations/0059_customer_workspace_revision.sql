-- Monotonic per-owner revision for optimistic cross-device workspace writes.
alter table customer_workspace
  add column if not exists revision bigint not null default 1;
