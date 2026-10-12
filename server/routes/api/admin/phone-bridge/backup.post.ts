import { createError, defineEventHandler, getCookie, readBody, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";

async function guard(event:H3Event){
 const token=getCookie(event,ADMIN_SESSION_COOKIE);if(!(await verifyAdminSessionToken(token)))throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست."});
 assertSameOrigin(event);const claims=await getAdminSessionClaims(token);if(!hasAdminPermission(normalizeAdminRole(claims?.role),"security.manage"))throw createError({statusCode:403,statusMessage:"مجوز امنیت مدیران لازم است."});
}
export default defineEventHandler(async(event)=>{
 await guard(event);if(dbSource==="unconfigured")throw createError({statusCode:503,statusMessage:"پایگاه داده آماده نیست."});
 const body=await readBody(event) as Record<string,unknown>;if(body?.schemaVersion!==1||!Array.isArray(body.devices))throw createError({statusCode:400,statusMessage:"فایل پشتیبان معتبر نیست."});
 const sql=await getSql();let updated=0;
 for(const raw of body.devices.slice(0,100)){
  const d=raw&&typeof raw==="object"?raw as Record<string,unknown>:{};
  const id=typeof d.id==="string"?d.id.trim():"";if(!id)continue;
  const modules=d.allowed_modules&&typeof d.allowed_modules==="object"?d.allowed_modules:{};
  await sql.query("update phone_bridge_devices set name=coalesce($2,name),allowed_modules=$3::jsonb,enabled=coalesce($4,enabled),min_app_version_code=coalesce($5,min_app_version_code) where id=$1",[id,typeof d.name==="string"?d.name:null,JSON.stringify(modules),typeof d.enabled==="boolean"?d.enabled:null,typeof d.min_app_version_code==="number"?d.min_app_version_code:null]);
  updated++;
 }
 return {ok:true,updated};
});