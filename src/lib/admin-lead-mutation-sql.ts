/** Update a lead and append its status activity in one atomic SQL statement. */
export const UPDATE_LEAD_STATUS_WITH_ACTIVITY_SQL = `
  with updated as (
    update leads
    set status=$2,
        follow_up_at=$3,
        last_contacted_at=case when $2='contacted' then current_timestamp else last_contacted_at end,
        updated_at=current_timestamp
    where id=$1
    returning id
  ), activity_log as (
    insert into lead_activities (lead_id, activity_type, title, note, metadata)
    select id, 'status', $4, $5, $6::jsonb from updated
    returning lead_id
  )
  select updated.id
  from updated join activity_log on activity_log.lead_id=updated.id
`;

/** Update a lead's visit state and append its activity atomically. */
export const UPDATE_LEAD_VISIT_STATUS_WITH_ACTIVITY_SQL = `
  with updated as (
    update leads
    set visit_status=$2, updated_at=current_timestamp
    where id=$1
    returning id
  ), activity_log as (
    insert into lead_activities (lead_id, activity_type, title, note, metadata)
    select id, 'visit', $3, $4, $5::jsonb from updated
    returning lead_id
  )
  select updated.id
  from updated join activity_log on activity_log.lead_id=updated.id
`;

/** Update a lead's note and its timeline entry atomically. */
export const UPDATE_LEAD_NOTE_WITH_ACTIVITY_SQL = `
  with updated as (
    update leads
    set note=$2, updated_at=current_timestamp
    where id=$1
    returning id, note
  ), activity_log as (
    insert into lead_activities (lead_id, activity_type, title, note, metadata)
    select id, 'note', $3, note, $4::jsonb from updated
    returning lead_id
  )
  select updated.id, updated.note
  from updated join activity_log on activity_log.lead_id=updated.id
`;

/** Change a follow-up date and append its timeline entry atomically. */
export const UPDATE_LEAD_FOLLOW_UP_WITH_ACTIVITY_SQL = `
  with updated as (
    update leads
    set follow_up_at=$2::timestamptz,
        status=case when $2::timestamptz is not null and status='new' then 'follow_up' else status end,
        updated_at=current_timestamp
    where id=$1
    returning id, follow_up_at
  ), activity_log as (
    insert into lead_activities (lead_id, activity_type, title, note, metadata)
    select id, 'follow_up', $3, $4, $5::jsonb from updated
    returning lead_id
  )
  select updated.id, updated.follow_up_at
  from updated join activity_log on activity_log.lead_id=updated.id
`;

/** Assign a consultant and append the assignment event atomically. */
export const ASSIGN_LEAD_WITH_ACTIVITY_SQL = `
  with updated as (
    update leads
    set consultant=$2, updated_at=current_timestamp
    where id=$1
    returning id
  ), activity_log as (
    insert into lead_activities (lead_id, activity_type, title, note, metadata)
    select id, 'status', $3, $4, $5::jsonb from updated
    returning lead_id
  )
  select updated.id
  from updated join activity_log on activity_log.lead_id=updated.id
`;
