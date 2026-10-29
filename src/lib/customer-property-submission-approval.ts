/**
 * Atomically claim a pending customer property submission for publication.
 * The caller inserts the published property in the same SQL statement using
 * `FROM claimed`, so a concurrent approval cannot publish a second listing.
 * If the insert fails, PostgreSQL rolls the claim back with the statement.
 *
 * Parameter contract: $1 is the new property ID, $42 is the submission ID,
 * $43 is the review note, and $44 is the submission updated_at snapshot.
 * The property INSERT uses $1-$41. The snapshot prevents an approval based on
 * stale property data from winning after a concurrent admin edit/rejection.
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
    returning id
  )
`;
