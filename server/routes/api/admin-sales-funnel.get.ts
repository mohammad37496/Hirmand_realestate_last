import { createError, defineEventHandler, getCookie, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "reports.view")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش قیف فروش برای این حساب فعال نیست." });
  }
  if (dbSource === "unconfigured") return { days: 30, statuses: [], sources: [], aging: [], conversions: {} };

  const query = getQuery(event);
  const rawDays = Number(query.days);
  const days = [7, 30, 90].includes(rawDays) ? rawDays : 30;
  const sql = await getSql();
  const [statusRows, sourceRows, agingRows, conversionRows] = await Promise.all([
    sql.query<Record<string, unknown>>(
      "select status,count(*)::int as count from leads where created_at >= current_timestamp - ($1::int * interval '1 day') group by status",
      [days],
    ),
    sql.query<Record<string, unknown>>(
      "select coalesce(nullif(trim(acquisition_source),''), nullif(trim(source),''), 'direct') as source,count(*)::int as count from leads where created_at >= current_timestamp - ($1::int * interval '1 day') group by 1 order by count desc limit 12",
      [days],
    ),
    sql.query<Record<string, unknown>>(
      "select case when created_at >= current_timestamp - interval '24 hours' then 'less_24h' when created_at >= current_timestamp - interval '3 days' then '1_3d' when created_at >= current_timestamp - interval '7 days' then '3_7d' else 'over_7d' end as bucket,count(*)::int as count from leads where status not in ('closed','spam') and created_at >= current_timestamp - ($1::int * interval '1 day') group by 1 order by 1",
      [days],
    ),
    sql.query<Record<string, unknown>>(
      "select count(*)::int as total,count(*) filter(where status='contacted')::int as contacted,count(*) filter(where status='follow_up')::int as follow_up,count(*) filter(where status='visited')::int as visited,count(*) filter(where status='contract')::int as contract,count(*) filter(where status='closed')::int as closed from leads where created_at >= current_timestamp - ($1::int * interval '1 day')",
      [days],
    ),
  ]);
  const labels: Record<string,string> = { new:"جدید", contacted:"تماس گرفته شد", follow_up:"پیگیری", visited:"بازدید", contract:"قرارداد", closed:"بسته‌شده", spam:"اسپم" };
  const statusMap = new Map(statusRows.map((row) => [String(row.status), n(row.count)]));
  const total = n(conversionRows[0]?.total);
  return {
    days,
    statuses: ["new","contacted","follow_up","visited","contract","closed","spam"].map((key) => ({ key, label: labels[key] ?? key, count: statusMap.get(key) ?? 0 })),
    sources: sourceRows.map((row) => ({ source: String(row.source), count: n(row.count) })),
    aging: ["less_24h","1_3d","3_7d","over_7d"].map((key) => ({ key, count: n(agingRows.find((row) => String(row.bucket) === key)?.count) })),
    conversions: {
      total,
      contacted: n(conversionRows[0]?.contacted),
      followUp: n(conversionRows[0]?.follow_up),
      visited: n(conversionRows[0]?.visited),
      contract: n(conversionRows[0]?.contract),
      closed: n(conversionRows[0]?.closed),
      contactedRate: total ? Math.round(n(conversionRows[0]?.contacted) / total * 1000) / 10 : 0,
      visitRate: total ? Math.round(n(conversionRows[0]?.visited) / total * 1000) / 10 : 0,
      contractRate: total ? Math.round(n(conversionRows[0]?.contract) / total * 1000) / 10 : 0,
    },
  };
});
