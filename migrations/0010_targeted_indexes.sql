-- Additional indexes for the most common property filters and analytics lookups.
create index if not exists properties_status_transaction_idx
  on properties (status, transaction_type);

create index if not exists properties_status_property_type_idx
  on properties (status, property_type);

create index if not exists properties_status_neighborhood_idx
  on properties (status, neighborhood);

create index if not exists site_page_days_path_day_idx
  on site_page_days (path, day desc);

create index if not exists site_events_day_property_event_idx
  on site_events (day desc, property_slug, event_name);
