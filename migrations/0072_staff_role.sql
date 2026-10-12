-- Add a staff-only role for controlled property intake and CRM work.
alter table admin_accounts drop constraint if exists admin_accounts_role_check;
alter table admin_accounts
  add constraint admin_accounts_role_check
  check (role in ('owner','manager','sales','content','staff','viewer'));
