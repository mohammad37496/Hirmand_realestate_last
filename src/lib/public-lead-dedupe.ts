export function buildRecentPublicLeadDuplicateQuery(phone: string) {
  return {
    sql: `select id from leads
          where phone = $1 and merged_into_lead_id is null
            and created_at > current_timestamp - interval '10 minutes'
          limit 1`,
    params: [phone],
  };
}

export function buildPublicDuplicateResponse(message: string) {
  return {
    success: true,
    duplicate: true,
    message,
  };
}
