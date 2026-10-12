-- Full property pricing history. The older previous_price columns keep only the last price;
-- this table preserves every price change made after this migration is applied.
create table if not exists admin_property_price_history (
  id bigserial primary key,
  property_id text not null,
  price_before numeric(20,0),
  price_after numeric(20,0),
  deposit_before numeric(20,0),
  deposit_after numeric(20,0),
  rent_before numeric(20,0),
  rent_after numeric(20,0),
  note text not null default '',
  created_by text not null default '',
  created_at timestamptz not null default current_timestamp
);
create index if not exists admin_property_price_history_property_idx
  on admin_property_price_history(property_id, created_at desc, id desc);
