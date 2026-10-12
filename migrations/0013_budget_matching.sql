-- Indexes for the public rental/mortgage budget-matching query.
create index if not exists properties_published_budget_tx_idx
  on properties (transaction_type, property_type, neighborhood, deposit, rent)
  where status = 'published' and transaction_type in ('rent', 'mortgage');

create index if not exists properties_published_rental_order_idx
  on properties (featured desc, published_at desc nulls last, created_at desc)
  where status = 'published' and transaction_type in ('rent', 'mortgage');
