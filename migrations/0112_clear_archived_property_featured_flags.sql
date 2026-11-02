-- Archived listings are never eligible for featured placement. Clean up legacy
-- rows left behind by manual status changes before the application guard ships.
update properties
set featured = false,
    featured_until = null
where status = 'archived'
  and (featured is distinct from false or featured_until is not null);
