-- A phone number may have at most one active RSVP for a given open house.
-- Cancelled rows remain as history and may be replaced by a later signup.
do $$
begin
  if exists (
    select 1
    from property_open_house_rsvps
    where status <> 'cancelled'
    group by open_house_id, phone
    having count(*) > 1
  ) then
    raise exception 'Cannot add active open-house RSVP uniqueness: duplicate active event/phone pairs already exist';
  end if;
end;
$$;

create unique index if not exists property_open_house_rsvps_active_phone_uidx
  on property_open_house_rsvps (open_house_id, phone)
  where status <> 'cancelled';
