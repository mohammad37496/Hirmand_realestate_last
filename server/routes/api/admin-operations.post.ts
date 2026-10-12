import { createError, defineEventHandler, getCookie, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

async function requireAdmin(event:H3Event){
  const token = getCookie(event, ADMIN_SESSION_COOKIE);
  if(!await verifyAdminSessionToken(token)){
    throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست. دوباره وارد پنل شوید."});
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "lead.manage")) {
    throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت پیگیری مشتریان برای این حساب فعال نیست." });
  }
  return claims;
}

export default defineEventHandler(async(event)=>{
  setResponseHeader(event,"cache-control","no-store");
  const claims = await requireAdmin(event);
  const role = normalizeAdminRole(claims?.role);
  const canViewFinance = hasAdminPermission(role, "finance.manage");
  if(dbSource==="unconfigured") return {dueLeads:[],dueCount:0,next7Count:0,staleProperties:0,finance:{income:0,expense:0,balance:0}};
  const sql=await getSql();
  const [due,next7,stale] = await Promise.all([
    sql.query<Record<string,unknown>>(
      `select id,name,phone,deal,neighborhood,status,follow_up_at
       from leads
       where status in ('new','contacted','follow_up','visited','contract')
         and follow_up_at is not null and follow_up_at <= current_timestamp
       order by follow_up_at asc limit 12`),
    sql.query<{count:number}>(
      `select count(*)::int as count from leads
       where status in ('new','contacted','follow_up','visited','contract')
         and follow_up_at > current_timestamp and follow_up_at <= current_timestamp + interval '7 days'`),
    sql.query<{count:number}>(
      `select count(*)::int as count from properties
       where status='published' and updated_at < current_timestamp - interval '30 days'`),
  ]);
  let income = 0;
  let expense = 0;
  if (canViewFinance) {
    const finance = await sql.query<{income:number;expense:number}>(
      "select coalesce(sum(amount) filter(where kind='income'),0)::numeric as income, coalesce(sum(amount) filter(where kind='expense'),0)::numeric as expense from finance_transactions");
    income = Number(finance[0]?.income) || 0;
    expense = Number(finance[0]?.expense) || 0;
  }
  return {
    dueCount:due.length,
    dueLeads:due.map(r=>({
      id:String(r.id),name:String(r.name),phone:String(r.phone),deal:String(r.deal),
      neighborhood:String(r.neighborhood??""),status:String(r.status),
      followUpAt:r.follow_up_at==null?null:new Date(String(r.follow_up_at)).toISOString()
    })),
    next7Count:Number(next7[0]?.count)||0,
    staleProperties:Number(stale[0]?.count)||0,
    finance:{income,expense,balance:income-expense}
  };
});
