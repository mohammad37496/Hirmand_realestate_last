/** Persist the latest match snapshot and its timeline event as one mutation. */
export const SAVE_MATCH_RESULTS_WITH_ACTIVITY_SQL = `
  with updated as (
    update leads
    set matched_properties=$2::jsonb, match_count=$3, updated_at=current_timestamp
    where id=$1 and merged_into_lead_id is null
    returning id
  ), activity_log as (
    insert into lead_activities (lead_id, activity_type, title, note, metadata)
    select id, 'match', $4, $5, $6::jsonb from updated
    returning lead_id
  )
  select updated.id from updated join activity_log on activity_log.lead_id=updated.id
`;

/** Record feedback only for an existing lead and a currently published property. */
export const INSERT_MATCH_FEEDBACK_SQL = `
  insert into lead_activities (lead_id, activity_type, title, note, metadata)
  select l.id, 'match', $3 || ' · ' || p.title, $4,
         jsonb_build_object('feedback', $5::text, 'propertyId', p.id, 'propertyTitle', p.title)
  from leads l join properties p on p.id=$2 and p.status='published'
  where l.id=$1 and l.merged_into_lead_id is null
  returning id
`;
