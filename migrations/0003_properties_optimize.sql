-- Database optimization for properties (Hirmand Real Estate)
-- Safe to re-run: all statements use IF NOT EXISTS / IF EXISTS where possible.

-- 1) Partial composite index for the public listing path
--    Covers: status='published' + order by featured, published_at, created_at
--    and equality filters on transaction_type / property_type.
drop index if exists properties_public_idx;

create index if not exists properties_published_list_idx
  on properties (featured desc, published_at desc nulls last, created_at desc)
  where status = 'published';

create index if not exists properties_published_tx_idx
  on properties (transaction_type, featured desc, published_at desc nulls last)
  where status = 'published';

create index if not exists properties_published_type_idx
  on properties (property_type, featured desc, published_at desc nulls last)
  where status = 'published';

-- 2) Neighborhood filter (exact match is common; ILIKE still benefits from btree prefix)
create index if not exists properties_published_neighborhood_idx
  on properties (neighborhood)
  where status = 'published';

-- 3) Admin listing by created_at
create index if not exists properties_admin_created_idx
  on properties (created_at desc);

-- 4) Fast lookup by status alone (counts, dashboards)
create index if not exists properties_status_idx
  on properties (status);

-- 5) Optional trigram support for ILIKE '%term%' on neighborhood (Neon/Postgres)
--    Skipped silently if extension is not available on the target plan.
do $$
begin
  create extension if not exists pg_trgm;
  create index if not exists properties_neighborhood_trgm_idx
    on properties using gin (neighborhood gin_trgm_ops)
    where status = 'published';
exception
  when others then
    -- Extension may be restricted on some serverless plans; ignore.
    null;
end $$;

-- 6) Keep updated_at fresh on every row change
create or replace function properties_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = current_timestamp;
  return new;
end;
$$;

drop trigger if exists properties_updated_at_trg on properties;
create trigger properties_updated_at_trg
  before update on properties
  for each row
  execute function properties_set_updated_at();

-- 7) Analyze for planner stats after index changes
analyze properties;
