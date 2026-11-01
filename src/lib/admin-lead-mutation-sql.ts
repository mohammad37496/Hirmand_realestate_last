/** Update a lead and append its status activity in one atomic SQL statement. */
export const UPDATE_LEAD_STATUS_WITH_ACTIVITY_SQL = `
  with updated as (
    update leads
    set status=$2,
        follow_up_at=$3,
        last_contacted_at=case when $2='contacted' then current_timestamp else last_contacted_at end,
        updated_at=current_timestamp
    where id=$1 and merged_into_lead_id is null
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
    where id=$1 and merged_into_lead_id is null
      and ($6::text is null or visit_status=$6)
      and status=$7
      and ($2 not in ('requested','confirmed') or status not in ('closed','spam'))
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
    where id=$1 and merged_into_lead_id is null
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
    where id=$1 and merged_into_lead_id is null
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
    where id=$1 and merged_into_lead_id is null
    returning id
  ), activity_log as (
    insert into lead_activities (lead_id, activity_type, title, note, metadata)
    select id, 'status', $3, $4, $5::jsonb from updated
    returning lead_id
  )
  select updated.id
  from updated join activity_log on activity_log.lead_id=updated.id
`;

/** Refresh a recent public budget lead only while it is still a canonical lead. */
export const UPDATE_EXISTING_BUDGET_LEAD_SQL = `
  update leads
  set name=$2, people_count=$3, job=$4, deal=$5, property_type=$6, neighborhood=$7, consultant=$8, note=$9,
      source=$10, follow_up_at=current_timestamp + interval '24 hours', lease_deadline=null,
      acquisition_source=$20, acquisition_medium=$21, acquisition_campaign=$22, acquisition_referrer=$23,
      acquisition_landing_path=$24, budget_deposit=$11, budget_rent=$12, budget_purchase=$13, budget_sale=$14,
      budget_rate=$15, budget_equivalent=$16, budget_bedrooms=$17, matched_properties=$18::jsonb,
      match_count=$19, floor_preference=$25, budget_deposit_min=$26, budget_deposit_max=$27,
      budget_rent_min=$28, budget_rent_max=$29, budget_purchase_min=$30, budget_purchase_max=$31,
      budget_sale_min=$32, budget_sale_max=$33, requested_amenities=$34::jsonb, requested_bedrooms=$35,
      requested_area_min=$36, requested_area_max=$37,
      public_tracking_token=coalesce(public_tracking_token,$38), updated_at=current_timestamp
  where id=$1 and merged_into_lead_id is null
  returning id,public_tracking_token
`;
