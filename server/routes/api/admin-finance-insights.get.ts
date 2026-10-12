import { createError, defineEventHandler, getCookie, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

async function requireAdmin(event:H3Event){
  const token=getCookie(event,ADMIN_SESSION_COOKIE);
  if(!(await verifyAdminSessionToken(token))) throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست."});
  assertSameOrigin(event);
  const claims=await getAdminSessionClaims(token);
  if(!hasAdminPermission(normalizeAdminRole(claims?.role),"finance.manage")) throw createError({statusCode:403,statusMessage:"دسترسی گزارش مالی فعال نیست."});
}
export default defineEventHandler(async event=>{
  setResponseHeader(event,"cache-control","no-store"); await requireAdmin(event);
  if(dbSource==="unconfigured") return {months:[],categories:[],consultants:[],outstanding:0};
  const sql=await getSql();
  const [months,categories,consultants,counts]=await Promise.all([
    sql.query<Record<string,unknown>>("select to_char(date_trunc('month',transaction_date),'YYYY-MM') as month, coalesce(sum(amount) filter(where kind='income'),0)::numeric as income, coalesce(sum(amount) filter(where kind='expense'),0)::numeric as expense from finance_transactions where transaction_date>=current_date-interval '11 months' group by 1 order by 1 asc"),
    sql.query<Record<string,unknown>>("select coalesce(nullif(trim(category),''),'بدون دسته') as category, coalesce(sum(amount) filter(where kind='income'),0)::numeric as income, coalesce(sum(amount) filter(where kind='expense'),0)::numeric as expense from finance_transactions where transaction_date>=current_date-interval '11 months' group by 1 order by sum(amount) desc limit 12"),
    sql.query<Record<string,unknown>>("select consultant,coalesce(sum(consultant_share),0)::numeric as due,coalesce(sum(consultant_share) filter(where status='paid'),0)::numeric as paid from admin_commission_settlements where status in ('pending','approved','paid') and trim(consultant)<>'' group by consultant order by due desc limit 12"),
    sql.query<Record<string,unknown>>("select count(*) filter(where status in ('pending','approved'))::int as outstanding from admin_commission_settlements")
  ]);
  return {
    months:months.map(r=>({month:String(r.month),income:Number(r.income)||0,expense:Number(r.expense)||0,balance:(Number(r.income)||0)-(Number(r.expense)||0)})),
    categories:categories.map(r=>({category:String(r.category),income:Number(r.income)||0,expense:Number(r.expense)||0})),
    consultants:consultants.map(r=>({name:String(r.consultant),due:Number(r.due)||0,paid:Number(r.paid)||0})),
    outstanding:Number(counts[0]?.outstanding)||0
  };
});
