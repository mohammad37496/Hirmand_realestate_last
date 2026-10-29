/**
 * Atomically claim a pending customer property submission for publication.
 * The caller inserts the published property, changes the linked CRM lead,
 * and writes property/lead/review history in the same SQL statement.
 *
 * Parameter contract: $1-$41 are property fields, $42 is the submission ID,
 * $43 is the review note, $44 is the submission updated_at snapshot, $45 is
 * property history JSON, $46 is the review event ID, $47 is review metadata,
 * and $48 is the property slug. Any failed insert rolls back the whole action.
 */
export const CLAIM_PENDING_CUSTOMER_PROPERTY_SUBMISSION_SQL = `
  with claimed as (
    update customer_property_submissions
    set status='approved',
        property_id=$1,
        review_note=$43,
        reviewed_at=current_timestamp,
        updated_at=current_timestamp
    where id=$42 and status='pending' and updated_at=$44
    returning id, lead_id
  )
`;

export function buildCustomerPropertySubmissionApprovalSql(propertyInsertSql: string): string {
  return `${CLAIM_PENDING_CUSTOMER_PROPERTY_SUBMISSION_SQL},
    inserted as (${propertyInsertSql}),
    contacted_leads as (
      update leads
      set status='contacted', updated_at=current_timestamp
      where id in (select lead_id from claimed where lead_id is not null)
        and exists (select 1 from inserted)
      returning id
    ),
    lead_events as (
      insert into lead_activities (lead_id,activity_type,title,note,metadata)
      select contacted_leads.id,'status','ملک مشتری تأیید و منتشر شد','فایل با موفقیت در سایت منتشر شد.',
             jsonb_build_object('submissionId',claimed.id,'propertyId',inserted.id,'propertySlug',$48::text)
      from claimed
      join inserted on true
      join contacted_leads on contacted_leads.id=claimed.lead_id
      returning lead_id
    ),
    property_events as (
      insert into property_change_history (property_id,action,before_state,after_state)
      select inserted.id,'created',null,$45::jsonb
      from inserted
      returning property_id
    ),
    review_events as (
      insert into customer_property_submission_events (id,submission_id,action,note,metadata)
      select $46,claimed.id,'approve',$43,$47::jsonb
      from claimed
      returning submission_id
    )
    select inserted.id
    from inserted
    join property_events on property_events.property_id=inserted.id
    join review_events on review_events.submission_id=$42`;
}
