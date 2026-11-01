-- Protect deal deletion from concurrent settlement creation and reject new orphan settlements.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'admin_commission_settlements_deal_id_fkey'
      and conrelid = 'admin_commission_settlements'::regclass
  ) then
    alter table admin_commission_settlements
      add constraint admin_commission_settlements_deal_id_fkey
      foreign key (deal_id) references admin_deals(id)
      on delete restrict
      not valid;
  end if;
end;
$$;
