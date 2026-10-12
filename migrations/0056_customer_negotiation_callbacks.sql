-- Customer-facing negotiation and callback preferences.
alter table leads
  add column if not exists callback_preferred_at timestamptz,
  add column if not exists offer_amount numeric(20,0),
  add column if not exists offer_conditions text not null default '';

create index if not exists leads_callback_preferred_idx
  on leads (callback_preferred_at, status);

create index if not exists leads_offer_property_idx
  on leads (property_id, offer_amount)
  where offer_amount is not null;