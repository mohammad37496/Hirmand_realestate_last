-- Preserve RSVP history while removing any duplicate active registrations.
with ranked as (
  select id,
         row_number() over (partition by open_house_id, phone order by created_at asc, id asc) as position
  from property_open_house_rsvps
  where status <> 'cancelled'
)
update property_open_house_rsvps as r
set status='cancelled'
from ranked
where ranked.id=r.id and ranked.position > 1;

-- A phone may register again after its earlier RSVP was cancelled.
create unique index if not exists property_open_house_rsvps_active_phone_unique_idx
  on property_open_house_rsvps (open_house_id, phone)
  where status <> 'cancelled';
