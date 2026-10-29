type QuerySql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

export async function updatePendingCustomerPropertySubmission(
  sql: QuerySql,
  input: { id: string; propertyData: string; reviewNote: string; updatedAt: unknown },
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `update customer_property_submissions
        set property_data=$2::jsonb, review_note=$3, updated_at=current_timestamp
      where id=$1 and status='pending' and updated_at=$4
      returning id`,
    [input.id, input.propertyData, input.reviewNote, input.updatedAt],
  );
  return rows.length === 1;
}

export async function rejectPendingCustomerPropertySubmission(
  sql: QuerySql,
  input: { id: string; reviewNote: string; updatedAt: unknown },
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `update customer_property_submissions
        set status='rejected', review_note=$2, reviewed_at=current_timestamp, updated_at=current_timestamp
      where id=$1 and status='pending' and updated_at=$3
      returning id`,
    [input.id, input.reviewNote, input.updatedAt],
  );
  return rows.length === 1;
}
