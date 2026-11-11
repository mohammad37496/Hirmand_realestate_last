import { createError, defineEventHandler, getCookie, getQuery, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { createAdminBackupExport, verifyAdminBackupTables } from "@/lib/admin-backup-verification";
async function requireAdmin(event:H3Event){
  const token=getCookie(event,ADMIN_SESSION_COOKIE);
  if(!await verifyAdminSessionToken(token)) throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست. دوباره وارد پنل شوید."});
  assertSameOrigin(event);
  const claims=await getAdminSessionClaims(token);
  if(!hasAdminPermission(normalizeAdminRole(claims?.role),"backup.manage")) throw createError({statusCode:403,statusMessage:"سطح دسترسی پشتیبان برای این حساب فعال نیست."});
}
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
if(String(query.mode??"")==="verify")return verifyAdminBackupTables(sql);
const backup=await createAdminBackupExport(sql);setResponseHeader(event,"content-type","application/json; charset=utf-8");setResponseHeader(event,"content-disposition",'attachment; filename="hirmand-admin-backup.json"');return backup;});
