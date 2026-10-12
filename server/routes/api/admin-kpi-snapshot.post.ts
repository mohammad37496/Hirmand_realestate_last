import { createError, defineEventHandler, getCookie, getQuery, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

async function requireReportAccess(event: H3Event) {
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "reports.view")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش برای این حساب فعال نیست." });
  }
}

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  await requireReportAccess(event);
  if (dbSource === "unconfigured") return { snapshots: [] };
  const sql = await getSql();
  const query = getQuery(event) as Record<string, unknown>;
  const rows = await sql.query<Record<string, unknown>>(
    String(query.action ?? "") === "sync"
      ? `insert into admin_kpi_snapshots(
           snapshot_date,properties_total,published_properties,leads_total,leads_last7,
           contracts_last30,visitors_last7,calls_last30,whatsapp_last30,overdue_followups,incomplete_properties
         )
         select
           (current_timestamp at time zone 'Asia/Tehran')::date,
           (select count(*) from properties where deleted_at is null),
           (select count(*) from properties where status='published' and deleted_at is null),
           (select count(*) from leads),
           (select count(*) from leads where created_at >= current_timestamp - interval '7 days'),
           (select count(*) from leads where status='contract' and created_at >= current_timestamp - interval '30 days'),
           (select count(distinct visitor_id) from site_visitor_days where day >= (current_timestamp at time zone 'Asia/Tehran')::date - 6),
           (select count(*) from site_events where event_name='call_click' and day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29),
           (select count(*) from site_events where event_name='whatsapp_click' and day >= (current_timestamp at time zone 'Asia/Tehran')::date - 29),
           (select count(*) from leads where status in ('new','contacted','follow_up','visited','contract') and follow_up_at is not null and follow_up_at <= current_timestamp),
           (select count(*) from properties where deleted_at is null and (
             coalesce(jsonb_array_length(images),0)=0 or coalesce(length(trim(description)),0)<120 or coalesce(trim(neighborhood),'')=''
           ))
         on conflict (snapshot_date) do update set
           properties_total=excluded.properties_total,published_properties=excluded.published_properties,
           leads_total=excluded.leads_total,leads_last7=excluded.leads_last7,
           contracts_last30=excluded.contracts_last30,visitors_last7=excluded.visitors_last7,
           calls_last30=excluded.calls_last30,whatsapp_last30=excluded.whatsapp_last30,
           overdue_followups=excluded.overdue_followups,incomplete_properties=excluded.incomplete_properties,
           updated_at=current_timestamp
         returning snapshot_date,properties_total,published_properties,leads_total,leads_last7,contracts_last30,visitors_last7,calls_last30,whatsapp_last30,overdue_followups,incomplete_properties`
      : "select snapshot_date,properties_total,published_properties,leads_total,leads_last7,contracts_last30,visitors_last7,calls_last30,whatsapp_last30,overdue_followups,incomplete_properties from admin_kpi_snapshots order by snapshot_date desc limit 14",
  );
  return {
    snapshots: rows.map((row) => ({
      date: String(row.snapshot_date).slice(0, 10),
      propertiesTotal: Number(row.properties_total) || 0,
      publishedProperties: Number(row.published_properties) || 0,
      leadsTotal: Number(row.leads_total) || 0,
      leadsLast7: Number(row.leads_last7) || 0,
      contractsLast30: Number(row.contracts_last30) || 0,
      visitorsLast7: Number(row.visitors_last7) || 0,
      callsLast30: Number(row.calls_last30) || 0,
      whatsappLast30: Number(row.whatsapp_last30) || 0,
      overdueFollowups: Number(row.overdue_followups) || 0,
      incompleteProperties: Number(row.incomplete_properties) || 0,
    })),
  };
});
