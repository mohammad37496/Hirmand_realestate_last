-- Further performance tuning for properties (safe / idempotent)

create index if not exists properties_published_area_list_idx
  on properties (neighborhood, featured desc, published_at desc nulls last)
  where status = 'published';

create index if not exists properties_published_city_idx
  on properties (city)
  where status = 'published';

create index if not exists properties_published_featured_idx
  on properties (published_at desc nulls last, created_at desc)
  where status = 'published' and featured = true;

create index if not exists properties_status_created_idx
  on properties (status, created_at desc);

analyze properties;
