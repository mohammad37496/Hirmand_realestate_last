import type { Sql } from "./db.ts";

export function loadAdminDashboardConsultantStats(sql: Sql) {
  return sql.query<Record<string, unknown>>(
    `select
      (select count(*)::int from consultants) as total,
      (select count(*)::int from consultants where is_active = true) as active,
      (
        select count(distinct c.id)::int
        from properties p
        inner join consultants c on c.id = p.consultant_id
      ) as consultants_with_files,
      (
        select count(distinct consultant_id)::int
        from leads
        where consultant_id is not null
      ) as consultants_with_leads`,
  );
}

export function loadAdminDashboardConsultantPerformance(sql: Sql) {
  return sql.query<Record<string, unknown>>(
    `with file_stats as (
       select c.id as key,
              count(*) filter (where p.status = 'published')::int as files
       from properties p
       join consultants c on c.id = p.consultant_id
       group by c.id
     ),
     lead_stats as (
       select consultant_id as key,
              count(*)::int as leads,
              count(*) filter (where status = 'contract')::int as contracts
       from leads
       where consultant_id is not null
         and created_at >= current_timestamp - interval '30 days'
       group by consultant_id
     ),
     event_stats as (
       select c.id as key,
              count(*) filter (where e.event_name = 'property_view')::int as views,
              count(*) filter (where e.event_name = 'call_click')::int as calls,
              count(*) filter (where e.event_name = 'whatsapp_click')::int as whatsapp
       from properties p
       join consultants c on c.id = p.consultant_id
       join site_events e on e.property_slug = p.slug
       where e.day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29
       group by c.id
     )
     select c.id, c.name, c.phone, c.is_active,
            coalesce(fs.files, 0)::int as files,
            coalesce(ls.leads, 0)::int as leads,
            coalesce(ls.contracts, 0)::int as contracts,
            coalesce(es.views, 0)::int as views,
            coalesce(es.calls, 0)::int as calls,
            coalesce(es.whatsapp, 0)::int as whatsapp
     from consultants c
     left join file_stats fs on fs.key = c.id
     left join lead_stats ls on ls.key = c.id
     left join event_stats es on es.key = c.id
     where coalesce(fs.files, 0) > 0
        or coalesce(ls.leads, 0) > 0
        or coalesce(es.views, 0) > 0
     order by leads desc, views desc, files desc, name asc, c.id asc
     limit 12`,
  );
}
