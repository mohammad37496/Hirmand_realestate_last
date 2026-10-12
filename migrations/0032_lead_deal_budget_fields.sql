-- Separate financial targets for purchase and sale inquiry leads.
alter table leads
  add column if not exists budget_purchase numeric(20,0),
  add column if not exists budget_sale numeric(20,0);
