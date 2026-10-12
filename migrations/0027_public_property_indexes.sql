-- Public property marketplace indexes.
-- These are intentionally partial: draft/archived records do not participate
-- in the public catalogue and should not bloat the hot indexes.
create index if not exists properties_public_feed_idx
  on properties (featured desc, published_at desc nulls last, created_at desc)
  where status = 'published';

create index if not exists properties_public_filter_idx
  on properties (transaction_type, property_type, neighborhood, published_at desc nulls last, created_at desc)
  where status = 'published';

create index if not exists properties_public_area_idx
  on properties (area_m2, bedrooms, published_at desc nulls last)
  where status = 'published';

do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists properties_public_search_trgm_idx
    on properties using gin (
      (
        coalesce(title, '') || ' ' ||
        coalesce(neighborhood, '') || ' ' ||
        coalesce(address, '')
      ) gin_trgm_ops
    )
    where status = 'published';
exception
  when others then
    null;
end $$;

analyze properties;
