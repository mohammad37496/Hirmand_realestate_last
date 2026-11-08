type QuerySql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

/** Atomically return a rejected submission to the review queue only if its snapshot is unchanged. */
export async function resubmitCustomerPropertySubmission(
  sql: QuerySql,
  input: {
    id: string;
    expectedUpdatedAt: unknown;
    ownerName: string;
    ownerPhone: string;
    propertyData: string;
  },
): Promise<boolean> {
  const rows = await sql.query<{ id: string }>(
    `update customer_property_submissions
       set status='pending', review_note='', reviewed_at=null,
           updated_at=current_timestamp, queue_started_at=current_timestamp,
           owner_name=$2, owner_phone=$3, property_data=$4::jsonb
     where id=$1 and status='rejected' and updated_at=$5
     returning id`,
    [input.id, input.ownerName, input.ownerPhone, input.propertyData, input.expectedUpdatedAt],
  );
  return rows.length === 1;
}
