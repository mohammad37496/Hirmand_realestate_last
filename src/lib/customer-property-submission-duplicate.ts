import type { Sql } from "./db.ts";

export type CustomerPropertySubmissionDuplicate = {
  id: string;
  public_tracking_token: string;
  owner_name: string;
  owner_phone: string;
};

/** Find other matching submissions, excluding the submission being created. */
export async function findPotentialDuplicateCustomerPropertySubmissions(
  sql: Pick<Sql, "query">,
  input: {
    excludeSubmissionId: string;
    ownerPhone: string;
    neighborhood: string;
    areaM2: string;
    normalizedTitle: string;
  },
): Promise<CustomerPropertySubmissionDuplicate[]> {
  return sql.query<CustomerPropertySubmissionDuplicate>(
    "select id,public_tracking_token,owner_name,owner_phone from customer_property_submissions where status in ('pending','approved') and id <> $5 and (owner_phone=$1 or ((property_data->>'neighborhood')=$2 and (property_data->>'areaM2')=$3 and lower(coalesce(property_data->>'title',''))=$4)) order by created_at desc limit 3",
    [input.ownerPhone, input.neighborhood, input.areaM2, input.normalizedTitle, input.excludeSubmissionId],
  );
}
