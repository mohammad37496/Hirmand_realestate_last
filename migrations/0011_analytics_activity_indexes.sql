-- Supporting indexes for lightweight real-time activity and anonymous event deduplication.
create index if not exists site_visitor_days_last_seen_idx
  on site_visitor_days (last_seen_at desc);

create index if not exists site_events_visitor_event_time_idx
  on site_events (visitor_id, event_name, created_at desc);
