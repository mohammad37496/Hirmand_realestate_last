-- Protect deal deletion from concurrent settlement creation and reject new orphan settlements.
alter table admin_commission_settlements
  add constraint admin_commission_settlements_deal_id_fkey
  foreign key (deal_id) references admin_deals(id)
  on delete restrict
  not valid;
