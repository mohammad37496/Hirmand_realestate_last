-- Speed up transaction-aware price filters and sorting for published listings.
create index if not exists properties_published_price_expr_idx
  on properties (
    (case
      when transaction_type = 'rent' then coalesce(rent, deposit)
      when transaction_type = 'mortgage' then deposit
      else price
    end)
  )
  where status = 'published';
