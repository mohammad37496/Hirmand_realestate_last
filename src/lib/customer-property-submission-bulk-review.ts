/** Bulk review mutations and their related CRM/audit events commit together. */
export const BULK_REJECT_CUSTOMER_PROPERTY_SUBMISSIONS_SQL = `
  with rejected as (
    update customer_property_submissions
    set status='rejected',
        review_note=$2,
        reviewed_at=current_timestamp,
        updated_at=current_timestamp
    where id = any($1::text[]) and status='pending'
    returning id, lead_id
  ), closed_leads as (
    update leads
    set status='closed', updated_at=current_timestamp
    where id in (select distinct lead_id from rejected where lead_id is not null)
      and merged_into_lead_id is null
    returning id
  ), lead_events as (
    insert into lead_activities (lead_id,activity_type,title,note,metadata)
    select closed_leads.id, 'status', 'ثبت ملک رد شد',
           case when trim($2)='' then 'درخواست ثبت ملک توسط کارشناس رد شد.' else $2 end,
           jsonb_build_object('submissionId', rejected.id, 'bulk', true)
    from rejected
    join closed_leads on closed_leads.id=rejected.lead_id
    returning lead_id
  ), review_events as (
    insert into customer_property_submission_events (id,submission_id,action,note,metadata)
    select gen_random_uuid()::text, rejected.id, 'reject', $2, jsonb_build_object('bulk', true)
    from rejected
    returning submission_id
  )
  select rejected.id
  from rejected
  join review_events on review_events.submission_id=rejected.id
  order by rejected.id
`;

export const BULK_SET_CUSTOMER_PROPERTY_SUBMISSION_PRIORITY_SQL = `
  with updated as (
    update customer_property_submissions
    set priority=$2, updated_at=current_timestamp
    where id = any($1::text[]) and status='pending'
    returning id
  ), review_events as (
    insert into customer_property_submission_events (id,submission_id,action,note,metadata)
    select gen_random_uuid()::text, updated.id, 'priority', 'اولویت پرونده به ' || $2 || ' تغییر کرد.',
           jsonb_build_object('priority', $2, 'bulk', true)
    from updated
    returning submission_id
  )
  select updated.id
  from updated
  join review_events on review_events.submission_id=updated.id
  order by updated.id
`;
