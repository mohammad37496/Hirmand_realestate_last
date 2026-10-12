-- Admin property search/sort indexes.
-- Safe to re-run: all statements use IF NOT EXISTS.

create index if not exists properties_admin_title_idx
  on properties (lower(title), updated_at desc);

create index if not exists properties_admin_price_expr_idx
  on properties (
    (
      case
        when transaction_type = 'rent' then coalesce(rent, deposit)
        when transaction_type = 'mortgage' then deposit
        else price
      end
    ) desc nulls last,
    updated_at desc
  );

-- Broad admin search across the fields shown/used in the panel.
-- pg_trgm may be unavailable on some plans; in that case the migration keeps
-- the regular B-tree indexes above and skips only this optional index.
do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists properties_admin_search_trgm_idx
    on properties using gin (
      (
        coalesce(title, '') || ' ' ||
        coalesce(neighborhood, '') || ' ' ||
        coalesce(address, '') || ' ' ||
        coalesce(contact_name, '') || ' ' ||
        coalesce(contact_phone, '') || ' ' ||
        coalesce(id, '')
      ) gin_trgm_ops
    );
exception
  when others then
    null;
end $$;

analyze properties;
