import { createError, defineEventHandler, getCookie, getQuery, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

const n = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clean = (value: unknown) => typeof value === "string" ? value : "";
export default defineEventHandler(async (event) => {
  setResponseHeader(event, "cache-control", "no-store");
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if (!(await verifyAdminSessionToken(token))) throw createError({ statusCode: 401, statusMessage: "نشست مدیریت معتبر نیست." });
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "reports.view")) throw createError({ statusCode: 403, statusMessage: "دسترسی گزارش مدیریتی برای این حساب فعال نیست." });
  if (dbSource === "unconfigured") return { days: 30, properties:{}, leads:{}, deals:{}, finance:null, topConsultants:[] };
  const query = getQuery(event); const rawDays=Number(query.days); const days=[7,30,90,365].includes(rawDays)?rawDays:30;
  const sql=await getSql();
  const [p,l,d,c,top]=await Promise.all([
    sql.query<Record<string,unknown>>("select count(*)::int as created,count(*) filter(where status='published')::int as published,count(*) filter(where status='draft')::int as draft,count(*) filter(where status='archived')::int as archived from properties where created_at >= current_timestamp - ($1::int * interval '1 day')",[days]),
    sql.query<Record<string,unknown>>("select count(*)::int as created,count(*) filter(where status in ('new','contacted','follow_up','visited','contract'))::int as open,count(*) filter(where status='contract')::int as contract,count(*) filter(where status='closed')::int as closed from leads where created_at >= current_timestamp - ($1::int * interval '1 day')",[days]),
    sql.query<Record<string,unknown>>("select count(*)::int as created,count(*) filter(where status='completed')::int as completed,count(*) filter(where status='contracted')::int as contracted,coalesce(sum(amount),0)::numeric as volume,coalesce(sum(commission),0)::numeric as commission from admin_deals where created_at >= current_timestamp - ($1::int * interval '1 day')",[days]),
    sql.query<Record<string,unknown>>("select coalesce(sum(amount) filter(where kind='income'),0)::numeric as income,coalesce(sum(amount) filter(where kind='expense'),0)::numeric as expense from finance_transactions where transaction_date >= current_date - ($1::int)",[days]),
    sql.query<Record<string,unknown>>("select consultant,count(*)::int as deals,coalesce(sum(amount),0)::numeric as volume from admin_deals where created_at >= current_timestamp - ($1::int * interval '1 day') and trim(consultant)<>'' group by consultant order by volume desc limit 10",[days]),
  ]);
  const role = normalizeAdminRole(claims?.role);
  const financeAllowed = hasAdminPermission(role, "finance.manage");
  const dealsAllowed = hasAdminPermission(role, "deal.manage");
  return {
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
