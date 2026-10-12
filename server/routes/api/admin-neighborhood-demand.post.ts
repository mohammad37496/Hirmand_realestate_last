import { createError, defineEventHandler, getCookie, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

async function requireAdmin(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "reports.view")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش تقاضای محله‌ها برای این حساب فعال نیست." });
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireAdmin(event);
  if (dbSource === "unconfigured") return { items: [] };

  const sql = await getSql();
  const rows = await sql.query<Record<string, unknown>>(
    `with property_counts as (
       select neighborhood,
              count(*)::int as files
       from properties
       where status='published'
       group by neighborhood
     ),
     event_counts as (
       select p.neighborhood,
              count(*) filter (where e.event_name='property_view')::int as views,
              count(*) filter (where e.event_name='property_favorite')::int as favorites,
              count(*) filter (where e.event_name in ('call_click','whatsapp_click'))::int as calls,
              count(*) filter (where e.event_name='visit_request')::int as visits
       from site_events e
       join properties p on p.slug=e.property_slug and p.status='published'
       where e.created_at >= current_timestamp - interval '30 days'
       group by p.neighborhood
     ),
     lead_counts as (
       select neighborhood, count(*)::int as leads
       from leads
       where created_at >= current_timestamp - interval '30 days'
         and status <> 'spam'
         and nullif(trim(neighborhood),'') is not null
       group by neighborhood
     )
     select
       pc.neighborhood,
       pc.files,
       coalesce(ec.views,0)::int as views,
       coalesce(ec.favorites,0)::int as favorites,
       coalesce(ec.calls,0)::int as calls,
       coalesce(ec.visits,0)::int as visits,
       coalesce(lc.leads,0)::int as leads,
       (
         coalesce(ec.views,0) +
         coalesce(ec.favorites,0) * 3 +
         coalesce(ec.calls,0) * 5 +
         coalesce(ec.visits,0) * 8 +
         coalesce(lc.leads,0) * 10
       )::int as demand_index
     from property_counts pc
     left join event_counts ec on ec.neighborhood=pc.neighborhood
     left join lead_counts lc on lc.neighborhood=pc.neighborhood
     order by demand_index desc, pc.files asc, pc.neighborhood asc
     limit 18`,
  );

  const maxDemand = Math.max(1, ...rows.map((row) => Number(row.demand_index) || 0));
  return {
    items: rows.map((row) => ({
      neighborhood: String(row.neighborhood),
      files: Number(row.files) || 0,
      views: Number(row.views) || 0,
      favorites: Number(row.favorites) || 0,
      calls: Number(row.calls) || 0,
      visits: Number(row.visits) || 0,
      leads: Number(row.leads) || 0,
      demandIndex: Number(row.demand_index) || 0,
      demandPercent: Math.round(((Number(row.demand_index) || 0) / maxDemand) * 100),
    })),
  };
});
