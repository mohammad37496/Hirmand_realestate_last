import type { Sql } from "./db.ts";

/** Load the rows used by the consultant load balancer without hiding DB errors. */
export async function loadAdminLeadAssignmentRows(
  sql: Pick<Sql, "query">,
  action: string,
) {
  const consultants = await sql.query<Record<string, unknown>>(
    `select
       c.name,
       c.phone,
       count(l.id) filter (where l.status not in ('closed','spam'))::int as active_leads,
       count(l.id) filter (
         where l.status in ('new','contacted','follow_up','visited')
           and l.follow_up_at is not null
           and l.follow_up_at < current_timestamp
       )::int as overdue,
       count(l.id) filter (
         where l.status not in ('closed','spam')
           and (l.visit_requested_at is not null or l.visit_status = 'requested')
       )::int as viewing_requests
     from consultants c
     left join leads l on trim(coalesce(l.consultant,'')) = trim(c.name)
     where c.is_active = true
     group by c.name, c.phone, c.sort_order
     order by c.sort_order asc, c.name asc`,
  );

  const unassigned = action === "assign"
    ? []
    : await sql.query<Record<string, unknown>>(
      "select id,name,phone,deal,property_type,neighborhood,created_at from leads where trim(coalesce(consultant,''))='' and status not in ('closed','spam') order by created_at desc limit 24",
    );

  return { consultants, unassigned };
}
