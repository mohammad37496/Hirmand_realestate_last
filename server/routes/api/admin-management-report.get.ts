import { createError, defineEventHandler, getCookie, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { MANAGEMENT_REPORT_DEALS_SQL, MANAGEMENT_REPORT_TOP_CONSULTANTS_SQL } from "@/lib/admin-management-report-sql";

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clean = (value: unknown) => typeof value === "string" ? value : "";
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "reports.view")) throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش مدیریتی برای این حساب فعال نیست." });
  const query = getQuery(event); const rawDays=Number(query.days); const days=[7,30,90,365].includes(rawDays)?rawDays:30;
  if (dbSource === "unconfigured") throw createError({ statusCode: 503, statusMessage: "\u06af\u0632\u0627\u0631\u0634\u200c\u0647\u0627\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a\u06cc \u0628\u0647\u200c\u062f\u0644\u06cc\u0644 \u062f\u0631 \u062f\u0633\u062a\u0631\u0633 \u0646\u0628\u0648\u062f\u0646 \u067e\u0627\u06cc\u06af\u0627\u0647 \u062f\u0627\u062f\u0647 \u0642\u0627\u0628\u0644 \u0628\u0627\u0632\u06cc\u0627\u0628\u06cc \u0646\u06cc\u0633\u062a??." });
  const sql=await getSql();
  const [p,l,d,c,top]=await Promise.all([
    sql.query<Record<string,unknown>>("select count(*)::int as created,count(*) filter(where status='published')::int as published,count(*) filter(where status='draft')::int as draft,count(*) filter(where status='archived')::int as archived from properties where created_at >= current_timestamp - ($1::int * interval '1 day')",[days]),
    sql.query<Record<string,unknown>>("select count(*)::int as created,count(*) filter(where status in ('new','contacted','follow_up','visited','contract'))::int as open,count(*) filter(where status='contract')::int as contract,count(*) filter(where status='closed')::int as closed from leads where created_at >= current_timestamp - ($1::int * interval '1 day')",[days]),
    sql.query<Record<string,unknown>>(MANAGEMENT_REPORT_DEALS_SQL,[days]),
    sql.query<Record<string,unknown>>("select coalesce(sum(amount) filter(where kind='income'),0)::numeric as income,coalesce(sum(amount) filter(where kind='expense'),0)::numeric as expense from finance_transactions where transaction_date >= current_date - ($1::int - 1) and transaction_date < current_date + 1",[days]),
    sql.query<Record<string,unknown>>(MANAGEMENT_REPORT_TOP_CONSULTANTS_SQL,[days]),
  ]);
  const role = normalizeAdminRole(claims?.role);
  const financeAllowed = hasAdminPermission(role, "finance.manage");
  const dealsAllowed = hasAdminPermission(role, "deal.manage");
  return {
    available: true,
    days,
    properties:{created:n(p[0]?.created),published:n(p[0]?.published),draft:n(p[0]?.draft),archived:n(p[0]?.archived)},
    leads:{created:n(l[0]?.created),open:n(l[0]?.open),contract:n(l[0]?.contract),closed:n(l[0]?.closed)},
    deals:{
      created:n(d[0]?.created),
      completed:n(d[0]?.completed),
      contracted:n(d[0]?.contracted),
      volume: dealsAllowed ? n(d[0]?.volume) : 0,
      commission: dealsAllowed ? n(d[0]?.commission) : 0,
    },
    finance: financeAllowed ? {income:n(c[0]?.income),expense:n(c[0]?.expense),balance:n(c[0]?.income)-n(c[0]?.expense)} : null,
    topConsultants: dealsAllowed ? top.map(row=>({name:clean(row.consultant)||"بدون مشاور",deals:n(row.deals),volume:n(row.volume)})) : [],
  };
});
