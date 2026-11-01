type QuerySql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export async function updatePendingCustomerPropertySubmission(
  sql: QuerySql,
  input: { id: string; propertyData: string; reviewNote: string; updatedAt: unknown },
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `with updated as (
       update customer_property_submissions
       set property_data=$2::jsonb, review_note=$3, updated_at=current_timestamp
       where id=$1 and status='pending' and updated_at=$4
       returning id
     ), review_events as (
       insert into customer_property_submission_events (id,submission_id,action,note,metadata)
       select gen_random_uuid()::text,updated.id,'edit',$3,'{}'::jsonb
       from updated
       returning submission_id
     )
     select updated.id from updated
     join review_events on review_events.submission_id=updated.id`,
    [input.id, input.propertyData, input.reviewNote, input.updatedAt],
  );
  return rows.length === 1;
}

export async function assignPendingCustomerPropertySubmission(
  sql: QuerySql,
  input: { id: string; consultantName: string | null; consultantPhone: string | null; note: string },
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `with updated as (
       update customer_property_submissions
       set assigned_consultant_name=$2,assigned_consultant_phone=$3,assigned_at=current_timestamp,updated_at=current_timestamp
       where id=$1 and status='pending'
       returning id
     ), review_events as (
       insert into customer_property_submission_events (id,submission_id,action,note,metadata)
       select gen_random_uuid()::text,updated.id,'assign',$4,$5::jsonb
       from updated
       returning submission_id
     )
     select updated.id from updated
     join review_events on review_events.submission_id=updated.id`,
    [input.id, input.consultantName, input.consultantPhone, input.note, JSON.stringify({ consultantName: input.consultantName, consultantPhone: input.consultantPhone })],
  );
  return rows.length === 1;
}

export async function setCustomerPropertySubmissionPriority(
  sql: QuerySql,
  input: { id: string; priority: "low" | "normal" | "high"; note: string },
): Promise<{ id: string; status: string } | null> {
  const rows = await sql.query<{ id: string; status: string }>(
    `with updated as (
       update customer_property_submissions
       set priority=$2,updated_at=current_timestamp
       where id=$1 and status='pending'
       returning id,status
     ), review_events as (
       insert into customer_property_submission_events (id,submission_id,action,note,metadata)
       select gen_random_uuid()::text,updated.id,'priority',$3,$4::jsonb
       from updated
       returning submission_id
     )
     select updated.id,updated.status from updated
     join review_events on review_events.submission_id=updated.id`,
    [input.id, input.priority, input.note, JSON.stringify({ priority: input.priority })],
  );
  return rows[0] ?? null;
}

export async function rejectPendingCustomerPropertySubmission(
  sql: QuerySql,
  input: { id: string; reviewNote: string; updatedAt: unknown },
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `with rejected as (
       update customer_property_submissions
       set status='rejected', review_note=$2, reviewed_at=current_timestamp, updated_at=current_timestamp
       where id=$1 and status='pending' and updated_at=$3
       returning id, lead_id
     ), closed_leads as (
       update leads set status='closed', updated_at=current_timestamp
       where id in (select lead_id from rejected where lead_id is not null)
       returning id
     ), lead_events as (
       insert into lead_activities (lead_id,activity_type,title,note,metadata)
       select closed_leads.id,'status','ثبت ملک رد شد',
              case when trim($2)='' then 'درخواست ثبت ملک توسط کارشناس رد شد.' else $2 end,
              jsonb_build_object('submissionId',rejected.id)
       from rejected join closed_leads on closed_leads.id=rejected.lead_id
       returning lead_id
     ), review_events as (
       insert into customer_property_submission_events (id,submission_id,action,note,metadata)
       select gen_random_uuid()::text,rejected.id,'reject',$2,'{}'::jsonb
       from rejected
       returning submission_id
     )
     select rejected.id from rejected
     join review_events on review_events.submission_id=rejected.id`,
    [input.id, input.reviewNote, input.updatedAt],
  );
  return rows.length === 1;
}
