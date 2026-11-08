type ReviewSql = {
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
};

type PendingReviewUpdate =
  | {
      action: "edit";
      id: string;
      expectedUpdatedAt: string;
      propertyData: string;
      reviewNote: string;
    }
  | {
      action: "reject";
      id: string;
      expectedUpdatedAt: string;
      reviewNote: string;
    }
  | {
      action: "approve";
      id: string;
      expectedUpdatedAt: string;
      propertyId: string;
      reviewNote: string;
    };

/** Compare and swap a pending customer submission against its exact DB timestamp. */
export async function updatePendingCustomerPropertySubmissionReview(
  sql: ReviewSql,
  input: PendingReviewUpdate,
): Promise<boolean> {
  if (!input.expectedUpdatedAt.trim()) return false;

  let rows: Array<{ id: string }>;
  if (input.action === "edit") {
    rows = await sql.query(
      `update customer_property_submissions
         set property_data=$2::jsonb,
             review_note=$3,
             updated_at=greatest(clock_timestamp(),updated_at + interval '1 microsecond')
       where id=$1 and status='pending' and updated_at=$4
       returning id`,
      [input.id, input.propertyData, input.reviewNote, input.expectedUpdatedAt],
    );
  } else if (input.action === "reject") {
    rows = await sql.query(
      `update customer_property_submissions
         set status='rejected',
             review_note=$2,
             reviewed_at=clock_timestamp(),
             updated_at=greatest(clock_timestamp(),updated_at + interval '1 microsecond')
       where id=$1 and status='pending' and updated_at=$3
       returning id`,
      [input.id, input.reviewNote, input.expectedUpdatedAt],
    );
  } else {
    rows = await sql.query(
      `update customer_property_submissions
         set status='approved',
             property_id=$2,
             review_note=$3,
             reviewed_at=clock_timestamp(),
             updated_at=greatest(clock_timestamp(),updated_at + interval '1 microsecond')
       where id=$1 and status='pending' and updated_at=$4
       returning id`,
      [input.id, input.propertyId, input.reviewNote, input.expectedUpdatedAt],
    );
  }

  return rows.length === 1;
}
