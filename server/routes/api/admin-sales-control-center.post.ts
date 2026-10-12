import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const ALLOWED_DAYS = new Set([7, 30, 90]);

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);

  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({
      statusCode: 401,
      statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید.",
    });
  }
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "deal.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مرکز کنترل فروش برای این حساب فعال نیست." });
  }

  const body = (await readBody(event).catch(() => ({}))) as { days?: unknown };
  const requestedDays = Number(body?.days);
  const days = ALLOWED_DAYS.has(requestedDays) ? requestedDays : 30;

  if (dbSource === "unconfigured") {
    return {
      days,
      pipeline: { new: 0, contacted: 0, follow_up: 0, visited: 0, contract: 0 },
      summary: {
        consultants: 0,
        activeConsultants: 0,
        activeLeads: 0,
        overdueLeads: 0,
        visitRequests: 0,
        contracts: 0,
        totalViews: 0,
      },
      consultants: [],
    };
  }

  const sql = await getSql();

  const [consultantRows, pipelineRows] = await Promise.all([
    sql.query<Record<string, unknown>>(
      `with file_stats as (
         select lower(trim(contact_name)) as key,
                count(*) filter (where status = 'published')::int as files
         from properties
         where coalesce(trim(contact_name), '') <> ''
         group by lower(trim(contact_name))
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
           lower(trim(p.contact_name)) as key,
           count(*) filter (where e.event_name = 'property_view')::int as views
         from properties p
         join site_events e on e.property_slug = p.slug
         where coalesce(trim(p.contact_name), '') <> ''
           and e.day >= (current_timestamp at time zone 'Asia/Tehran')::date - ${days - 1}
         group by lower(trim(p.contact_name))
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
       left join file_stats fs on fs.key = lower(trim(c.name))
       left join lead_stats ls on ls.key = lower(trim(c.name))
       left join event_stats es on es.key = lower(trim(c.name))
       order by overdue_leads desc, visit_requests desc, active_leads desc, period_contracts desc, c.name asc
      `,
    ).catch((error) => {
      console.error("[admin-sales-control-center] consultant query unavailable", error);
      return [] as Record<string, unknown>[];
    }),
    sql.query<Record<string, unknown>>(
      `select
         count(*) filter (where status = 'new')::int as new,
         count(*) filter (where status = 'contacted')::int as contacted,
         count(*) filter (where status = 'follow_up')::int as follow_up,
         count(*) filter (where status = 'visited')::int as visited,
         count(*) filter (where status = 'contract')::int as contract
       from leads
       where created_at >= current_timestamp - interval '${days} days'
      `,
    ).catch((error) => {
      console.error("[admin-sales-control-center] pipeline query unavailable", error);
      return [] as Record<string, unknown>[];
    }),
  ]);

  const consultants = consultantRows.map((row) => {
    const leads = Number(row.leads) || 0;
    const periodContracts = Number(row.period_contracts) || 0;
    return {
      id: String(row.id),
      name: String(row.name ?? ""),
      phone: String(row.phone ?? ""),
      active: row.is_active === true || row.is_active === "t" || row.is_active === 1,
      files: Number(row.files) || 0,
      leads,
      activeLeads: Number(row.active_leads) || 0,
      new7d: Number(row.new_7d) || 0,
      overdueLeads: Number(row.overdue_leads) || 0,
      nextFollowUps: Number(row.next_follow_ups) || 0,
      visitRequests: Number(row.visit_requests) || 0,
      contracts: Number(row.contracts) || 0,
      periodContracts,
      views: Number(row.views) || 0,
      conversionRate: leads > 0 ? Number(((periodContracts / leads) * 100).toFixed(1)) : 0,
    };
  });

  const pipelineRow = (pipelineRows[0] ?? {}) as Record<string, unknown>;
  const summary = consultants.reduce(
    (acc, item) => {
      acc.consultants += 1;
      if (item.active) acc.activeConsultants += 1;
      acc.activeLeads += item.activeLeads;
      acc.overdueLeads += item.overdueLeads;
      acc.visitRequests += item.visitRequests;
      acc.contracts += item.periodContracts;
      acc.totalViews += item.views;
      return acc;
    },
    {
      consultants: 0,
      activeConsultants: 0,
      activeLeads: 0,
      overdueLeads: 0,
      visitRequests: 0,
      contracts: 0,
      totalViews: 0,
    },
  );

  return {
    days,
    pipeline: {
      new: Number(pipelineRow.new) || 0,
      contacted: Number(pipelineRow.contacted) || 0,
      follow_up: Number(pipelineRow.follow_up) || 0,
      visited: Number(pipelineRow.visited) || 0,
      contract: Number(pipelineRow.contract) || 0,
    },
    summary,
    consultants,
  };
});
