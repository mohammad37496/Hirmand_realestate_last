-- Supporting indexes for public property filters and lead dashboard time windows.
create index if not exists properties_status_area_idx on properties (status, area_m2);
create index if not exists properties_status_price_idx on properties (status, price);
create index if not exists properties_status_deposit_idx on properties (status, deposit);
create index if not exists properties_status_rent_idx on properties (status, rent);
create index if not exists leads_created_at_idx on leads (created_at desc);
