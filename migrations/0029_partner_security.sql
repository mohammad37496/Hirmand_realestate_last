alter table partner_accounts
  add column if not exists failed_login_count integer not null default 0,
  add column if not exists locked_until timestamptz;

create index if not exists partner_accounts_locked_idx
  on partner_accounts (locked_until)
  where locked_until is not null;
