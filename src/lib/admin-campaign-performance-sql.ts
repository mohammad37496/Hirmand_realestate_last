export const ADMIN_CAMPAIGN_TOTALS_SQL = `
  select
    count(*)::int as campaigns,
    coalesce(sum(grouped.leads), 0)::int as leads,
    coalesce(sum(grouped.contacted), 0)::int as contacted,
    coalesce(sum(grouped.visits), 0)::int as visits,
    coalesce(sum(grouped.contracts), 0)::int as contracts
  from (
    select
      count(*)::int as leads,
      count(*) filter (where last_contacted_at is not null or status in ('contacted','follow_up','visited','contract'))::int as contacted,
      count(*) filter (where visit_requested_at is not null or visit_status = 'requested' or status = 'visited')::int as visits,
      count(*) filter (where status = 'contract')::int as contracts
    from leads
    where created_at >= current_timestamp - ($1::int * interval '1 day')
    group by
      coalesce(nullif(trim(acquisition_source), ''), nullif(trim(source), ''), 'direct'),
      coalesce(nullif(trim(acquisition_medium), ''), '—'),
      coalesce(nullif(trim(acquisition_campaign), ''), 'بدون کمپین')
  ) grouped
`;
