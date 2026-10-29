export function buildPendingSubmissionDuplicateQuery(ownerPhone: string, propertyData: unknown) {
  return {
    sql: "select id, public_tracking_token from customer_property_submissions where owner_phone=$1 and created_at > current_timestamp - interval '30 minutes' and status='pending' and property_data=$2::jsonb order by created_at desc limit 1",
    params: [ownerPhone, JSON.stringify(propertyData)],
  };
}
