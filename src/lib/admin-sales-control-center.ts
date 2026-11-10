import type { Sql } from "./db.ts";

export async function loadAdminSalesControlCenterQueries(sql: Sql, days: 7 | 30 | 90) {
  return Promise.all([
    sql.query<Record<string, unknown>>(
      `with file_stats as (
         select c.id as key,
                count(*) filter (where status = 'published')::int as files
         from properties p
         join consultants c on c.id = p.consultant_id
         group by c.id
       ),
       lead_stats as (
         select
           lower(trim(consultant)) as key,
           count(*)::int as leads,
           count(*) filter (where created_at >= current_timestamp - interval '${days} days')::int as period_leads,
           count(*) filter (where status in ('new','contacted','follow_up','visited'))::int as active_leads,
           count(*) filter (where created_at >= current_timestamp - interval '7 days')::int as new_7d,
           count(*) filter (
             where status in ('new','contacted','follow_up')
               and created_at < current_timestamp - interval '24 hours'
               and not exists (
                 select 1
                 from lead_activities a
                 where a.lead_id = leads.id
                   and a.activity_type in ('call','whatsapp','visit')
               )
           )::int as overdue_leads,
           count(*) filter (
             where follow_up_at > current_timestamp
               and follow_up_at <= current_timestamp + interval '7 days'
               and status in ('new','contacted','follow_up','visited','contract')
           )::int as next_follow_ups,
           count(*) filter (where visit_status = 'requested')::int as visit_requests,
           count(*) filter (where status = 'contract')::int as contracts,
           count(*) filter (where status = 'contract' and created_at >= current_timestamp - interval '${days} days')::int as period_contracts
         from leads
         where coalesce(trim(consultant), '') <> ''
         group by lower(trim(consultant))
       ),
       event_stats as (
         select
           c.id as key,
           count(*) filter (where e.event_name = 'property_view')::int as views
         from properties p
         join consultants c on c.id = p.consultant_id
         join site_events e on e.property_slug = p.slug
         where e.day >= (current_timestamp at time zone 'Asia/Tehran')::date - ${days - 1}
         group by c.id
       )
       select
         c.id,
         c.name,
         c.phone,
         c.is_active,
         coalesce(fs.files, 0)::int as files,
         coalesce(ls.leads, 0)::int as leads,
         coalesce(ls.period_leads, 0)::int as period_leads,
         coalesce(ls.active_leads, 0)::int as active_leads,
         coalesce(ls.new_7d, 0)::int as new_7d,
         coalesce(ls.overdue_leads, 0)::int as overdue_leads,
         coalesce(ls.next_follow_ups, 0)::int as next_follow_ups,
         coalesce(ls.visit_requests, 0)::int as visit_requests,
         coalesce(ls.contracts, 0)::int as contracts,
         coalesce(ls.period_contracts, 0)::int as period_contracts,
         coalesce(es.views, 0)::int as views
       from consultants c
       left join file_stats fs on fs.key = c.id
       left join lead_stats ls on ls.key = lower(trim(c.name))
       left join event_stats es on es.key = c.id
       order by overdue_leads desc, visit_requests desc, active_leads desc, period_contracts desc, c.name asc`,
    ),
    sql.query<Record<string, unknown>>(
      `select
         count(*) filter (where status = 'new')::int as new,
         count(*) filter (where status = 'contacted')::int as contacted,
         count(*) filter (where status = 'follow_up')::int as follow_up,
         count(*) filter (where status = 'visited')::int as visited,
         count(*) filter (where status = 'contract')::int as contract
       from leads
       where created_at >= current_timestamp - interval '${days} days'`,
    ),
  ]);
}
