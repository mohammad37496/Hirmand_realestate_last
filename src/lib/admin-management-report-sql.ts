/** Management report business totals use the same effective-deal rules as the deal dashboard. */
export const MANAGEMENT_REPORT_DEALS_SQL = `
  select
    count(*)::int as created,
    count(*) filter(where status='completed')::int as completed,
    count(*) filter(where status='contracted')::int as contracted,
    coalesce(sum(amount) filter(where status<>'cancelled'),0)::numeric as volume,
    coalesce(sum(commission) filter(where status in ('contracted','completed')),0)::numeric as commission
  from admin_deals
  where created_at >= current_timestamp - ($1::int * interval '1 day')
`;

/** Cancelled deals must not inflate consultant deal counts or ranking volume. */
export const MANAGEMENT_REPORT_TOP_CONSULTANTS_SQL = `
  select consultant,count(*)::int as deals,coalesce(sum(amount),0)::numeric as volume
  from admin_deals
  where created_at >= current_timestamp - ($1::int * interval '1 day')
    and status<>'cancelled'
    and trim(consultant)<>''
  group by consultant
  order by volume desc
  limit 10
`;
