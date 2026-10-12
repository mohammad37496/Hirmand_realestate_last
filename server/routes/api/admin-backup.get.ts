import { createError, defineEventHandler, getCookie, getQuery, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
async function requireAdmin(event:H3Event){
  const token=getCookie(event,ADMIN_SESSION_COOKIE);
  if(!await verifyAdminSessionToken(token)) throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست. دوباره وارد پنل شوید."});
  assertSameOrigin(event);
  const claims=await getAdminSessionClaims(token);
  if(!hasAdminPermission(normalizeAdminRole(claims?.role),"backup.manage")) throw createError({statusCode:403,statusMessage:"سطح دسترسی پشتیبان برای این حساب فعال نیست."});
}
const TABLES=["properties","leads","lead_activities","finance_transactions","consultants","staff_attendance","staff_mobile_devices","admin_tasks","property_change_history","site_events"] as const;
async function verifyTables(sql:Awaited<ReturnType<typeof getSql>>){return Promise.all(TABLES.map(async(table)=>{const existsRows=await sql.query<{name:string|null}>("select to_regclass($1) as name",[table]).catch(()=>[]);const exists=Boolean(existsRows[0]?.name);const count=exists?Number((await sql.query<{count:number}>(`select count(*)::int as count from ${table}`).catch(()=>[{count:0}]))[0]?.count)||0:0;return {table,exists,count};}));}
export default defineEventHandler(async(event)=>{await requireAdmin(event);setResponseHeader(event,"cache-control","no-store");if(dbSource==="unconfigured")throw createError({statusCode:503,statusMessage:"پایگاه داده تنظیم نشده است."});const sql=await getSql();const query=getQuery(event) as Record<string,unknown>;
if(String(query.mode??"")==="history"){
  const rows=await sql.query<Record<string,unknown>>("select id,kind,created_at,table_counts from admin_backup_log order by created_at desc limit 40");
  return {
    backups: rows.map((row)=>({
      id:Number(row.id),
      kind:String(row.kind??"json_export"),
      createdAt:new Date(String(row.created_at)).toISOString(),
      tableCounts:row.table_counts && typeof row.table_counts==="object" ? row.table_counts : {},
    })),
  };
}
if(String(query.mode??"")==="verify"){const tables=await verifyTables(sql);const core=["properties","leads","consultants"] as const;return {verifiedAt:new Date().toISOString(),coreReady:core.every((name)=>tables.find((item)=>item.table===name)?.exists),tables};}
const [properties,leads,activities,finance,consultants,attendance,staffMobileDevices]=await Promise.all([sql.query("select * from properties"),sql.query("select * from leads"),sql.query("select * from lead_activities"),sql.query("select * from finance_transactions"),sql.query("select * from consultants"),sql.query("select * from staff_attendance"),sql.query("select * from staff_mobile_devices")]);const tableCounts={properties:properties.length,leads:leads.length,leadActivities:activities.length,financeTransactions:finance.length,consultants:consultants.length,attendance:attendance.length,staffMobileDevices:staffMobileDevices.length};const payload={exportedAt:new Date().toISOString(),app:"Hirmand Real Estate",version:3,integrity:{kind:"row-count",tableCounts,totalRows:Object.values(tableCounts).reduce((sum,value)=>sum+value,0)},properties,leads,leadActivities:activities,financeTransactions:finance,consultants,attendance,staffMobileDevices};await sql.query("insert into admin_backup_log(kind,table_counts) values($1,$2::jsonb)",["json_export",JSON.stringify(tableCounts)]).catch(()=>{});setResponseHeader(event,"content-type","application/json; charset=utf-8");setResponseHeader(event,"content-disposition",'attachment; filename="hirmand-admin-backup.json"');return JSON.stringify(payload,null,2);});
