import type { Sql } from "./db.ts";

export async function loadAdminCampaignPerformanceQueries(sql: Sql, days: 7 | 30 | 90) {
  const [rows, daily, quality] = await Promise.all([
    sql.query<Record<string, unknown>>(
      `select
         coalesce(nullif(trim(acquisition_source), ''), nullif(trim(source), ''), 'direct') as source,
         coalesce(nullif(trim(acquisition_medium), ''), '—') as medium,
         coalesce(nullif(trim(acquisition_campaign), ''), 'بدون کمپین') as campaign,
         count(*)::int as leads,
         count(*) filter (where last_contacted_at is not null or status in ('contacted','follow_up','visited','contract'))::int as contacted,
         count(*) filter (where visit_requested_at is not null or visit_status = 'requested' or status = 'visited')::int as visits,
         count(*) filter (where status = 'contract')::int as contracts
       from leads
       where created_at >= current_timestamp - interval '${days} days'
       group by 1,2,3
       order by contracts desc, visits desc, leads desc, source asc, campaign asc
       limit 50`,
    ),
    sql.query<Record<string, unknown>>(
      `select
         to_char(day::date, 'YYYY-MM-DD') as day,
         count(l.id)::int as leads,
         count(l.id) filter (where l.status = 'contract')::int as contracts
       from generate_series(
         current_date - interval '${days - 1} days',
         current_date,
         interval '1 day'
       ) as day
       left join leads l on l.created_at >= day and l.created_at < day + interval '1 day'
       group by day
       order by day asc`,
    ),
    sql.query<Record<string, unknown>>(
      `select
         count(*)::int as leads,
         count(*) filter (where nullif(trim(coalesce(acquisition_source,'')), '') is not null)::int as source,
         count(*) filter (where nullif(trim(coalesce(acquisition_medium,'')), '') is not null)::int as medium,
         count(*) filter (where nullif(trim(coalesce(acquisition_campaign,'')), '') is not null)::int as campaign
       from leads
       where created_at >= current_timestamp - interval '${days} days'`,
    ),
  ]);
  return { rows, daily, quality };
}
