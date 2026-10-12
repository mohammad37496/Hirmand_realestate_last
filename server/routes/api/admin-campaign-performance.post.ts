import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

const ALLOWED_DAYS = new Set([7, 30, 90]);

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  assertSameOrigin(event);
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!await verifyAdminSessionToken(token)) {
    throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست. دوباره وارد پنل شوید." });
  }
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "reports.view")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش کمپین‌ها برای این حساب فعال نیست." });
  }

  const body = (await readBody(event).catch(() => ({}))) as { days?: unknown };
  const candidate = Number(body?.days);
  const days = ALLOWED_DAYS.has(candidate) ? candidate : 30;

  if (dbSource === "unconfigured") {
    return { days, rows: [], daily: [], quality: { leads: 0, source: 0, medium: 0, campaign: 0 }, totals: { campaigns: 0, leads: 0, contacted: 0, visits: 0, contracts: 0 } };
  }

  const sql = await getSql();
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
    ).catch((error) => {
      console.error("[admin-campaign-performance] grouped query unavailable", error);
      return [];
    }),
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
    ).catch((error) => {
      console.error("[admin-campaign-performance] daily query unavailable", error);
      return [];
    }),
    sql.query<Record<string, unknown>>(
      `select
         count(*)::int as leads,
         count(*) filter (where nullif(trim(coalesce(acquisition_source,'')), '') is not null)::int as source,
         count(*) filter (where nullif(trim(coalesce(acquisition_medium,'')), '') is not null)::int as medium,
         count(*) filter (where nullif(trim(coalesce(acquisition_campaign,'')), '') is not null)::int as campaign
       from leads
       where created_at >= current_timestamp - interval '${days} days'`,
    ).catch((error) => {
      console.error("[admin-campaign-performance] quality query unavailable", error);
      return [];
    }),
  ]);

  const mapped = rows.map((row) => {
    const leads = Number(row.leads) || 0;
    const contacted = Number(row.contacted) || 0;
    const visits = Number(row.visits) || 0;
    const contracts = Number(row.contracts) || 0;
    return {
      source: String(row.source ?? "direct"),
      medium: String(row.medium ?? "—"),
      campaign: String(row.campaign ?? "بدون کمپین"),
      leads, contacted, visits, contracts,
      contactRate: leads ? Number(((contacted / leads) * 100).toFixed(1)) : 0,
      contractRate: leads ? Number(((contracts / leads) * 100).toFixed(1)) : 0,
    };
  });

  const dailyMapped = daily.map((row) => ({ day: String(row.day ?? ""), leads: Number(row.leads) || 0, contracts: Number(row.contracts) || 0 }));
  const qualityBase = quality[0] ?? {};
  const qualityLeads = Number(qualityBase.leads) || 0;
  const qualityMapped = {
    leads: qualityLeads,
    source: qualityLeads ? Number(((Number(qualityBase.source) || 0) / qualityLeads * 100).toFixed(1)) : 0,
    medium: qualityLeads ? Number(((Number(qualityBase.medium) || 0) / qualityLeads * 100).toFixed(1)) : 0,
    campaign: qualityLeads ? Number(((Number(qualityBase.campaign) || 0) / qualityLeads * 100).toFixed(1)) : 0,
  };

  const totals = mapped.reduce(
    (acc, row) => ({ campaigns: acc.campaigns + 1, leads: acc.leads + row.leads, contacted: acc.contacted + row.contacted, visits: acc.visits + row.visits, contracts: acc.contracts + row.contracts }),
    { campaigns: 0, leads: 0, contacted: 0, visits: 0, contracts: 0 },
  );

  return { days, rows: mapped, daily: dailyMapped, quality: qualityMapped, totals };
});
