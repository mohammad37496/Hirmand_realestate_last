export const ADMIN_DASHBOARD_PROPERTY_STATS_SQL = `
  select
    count(*)::int as total,
    count(*) filter (where status = 'published')::int as published,
    count(*) filter (where status = 'draft')::int as draft,
    count(*) filter (where status = 'archived')::int as archived,
    count(*) filter (
      where featured = true
        and (featured_until is null or featured_until >= current_timestamp)
    )::int as featured,
    count(*) filter (where coalesce(jsonb_array_length(images), 0) = 0)::int as without_images,
    count(*) filter (where created_at >= current_timestamp - interval '7 days')::int as new_last7,
    count(*) filter (
      where coalesce(jsonb_array_length(images), 0) = 0
         or coalesce(length(trim(description)), 0) < 120
         or coalesce(trim(neighborhood), '') = ''
    )::int as incomplete
  from properties
  where deleted_at is null
`;

export const ADMIN_DASHBOARD_PROPERTY_TYPES_SQL = `
  select property_type, count(*)::int as count
  from properties
  where deleted_at is null
  group by property_type
  order by count desc
`;
