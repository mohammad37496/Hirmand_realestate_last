import { createError, defineEventHandler, getCookie, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

async function guard(event:H3Event){
 const token=getCookie(event,ADMIN_SESSION_COOKIE);
 if(!(await verifyAdminSessionToken(token)))throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست."});
 assertSameOrigin(event); const claims=await getAdminSessionClaims(token);
 if(!hasAdminPermission(normalizeAdminRole(claims?.role),"security.manage"))throw createError({statusCode:403,statusMessage:"مجوز امنیت مدیران لازم است."});
}
export default defineEventHandler(async(event)=>{
 await guard(event); if(dbSource==="unconfigured")throw createError({statusCode:503,statusMessage:"پایگاه داده آماده نیست."});
 const sql=await getSql();
 const devices=await sql.query<Record<string,unknown>>("select id,name,manufacturer,model,android_version,sdk_int,enabled,allowed_modules,app_version_name,app_version_code,min_app_version_code from phone_bridge_devices order by name asc");
 const commands=await sql.query<Record<string,unknown>>("select id,device_id,action,status,payload,result,error_message,created_at,completed_at from phone_bridge_remote_commands order by created_at desc limit 500");
 setResponseHeader(event,"content-type","application/json; charset=utf-8");setResponseHeader(event,"content-disposition","attachment; filename=phone-bridge-backup.json");setResponseHeader(event,"cache-control","private, no-store");
 return {schemaVersion:1,exportedAt:new Date().toISOString(),devices,commands};
});