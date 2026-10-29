type QuerySql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

/**
 * Atomically move a rejected customer submission back to the review queue.
 * The status predicate prevents a stale public resubmission request from
 * overwriting a newer admin approval/rejection that happened after its read.
 */
export async function resubmitCustomerPropertySubmission(
  sql: QuerySql,
  input: {
    id: string;
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
     where id=$1 and status='rejected'
     returning id`,
    [input.id, input.ownerName, input.ownerPhone, input.propertyData],
  );
  return rows.length === 1;
}
