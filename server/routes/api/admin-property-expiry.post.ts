import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import {
  ARCHIVE_EXPIRED_PROPERTIES_SQL,
  CREATE_PROPERTY_RENEWAL_TASK_SQL,
  EXTEND_PROPERTY_EXPIRY_SQL,
} from "@/lib/admin-property-expiry-sql";
async function requireAdmin(event:H3Event){const token=getCookie(event,ADMIN_SESSION_COOKIE);if(!(await verifyAdminSessionToken(token)))throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست."});assertSameOrigin(event);const claims=await getAdminSessionClaims(token);if(!hasAdminPermission(normalizeAdminRole(claims?.role),"property.manage"))throw createError({statusCode:403,statusMessage:"دسترسی مدیریت فایل برای این حساب فعال نیست."});return claims;}
const clean=(v:unknown,max=160)=>typeof v==="string"?v.trim().slice(0,max):"";
export default defineEventHandler(async event=>{
 setResponseHeader(event,"cache-control","no-store");const claims=await requireAdmin(event);if(dbSource==="unconfigured")return {expired:[],soon:[],review:[],archived:0,createdTasks:0};
 const sql=await getSql();const body=(await readBody(event).catch(()=>({}))) as Record<string,unknown>;const action=clean(body.action,30)||"list";
 const load=async()=>{const [expired,soon,review]=await Promise.all([
  sql.query<Record<string,unknown>>("select id,slug,title,neighborhood,unpublish_at,published_at from properties where deleted_at is null and status='published' and unpublish_at is not null and unpublish_at<=current_timestamp order by unpublish_at asc limit 80"),
  sql.query<Record<string,unknown>>("select id,slug,title,neighborhood,unpublish_at,published_at from properties where deleted_at is null and status='published' and unpublish_at>current_timestamp and unpublish_at<=current_timestamp+interval '7 days' order by unpublish_at asc limit 80"),
  sql.query<Record<string,unknown>>("select id,slug,title,neighborhood,published_at,updated_at from properties where deleted_at is null and status='published' and unpublish_at is null and coalesce(published_at,created_at)<current_timestamp-interval '90 days' order by coalesce(published_at,created_at) asc limit 80")
 ]);return {expired:expired.map(r=>({id:String(r.id),slug:String(r.slug),title:String(r.title),neighborhood:String(r.neighborhood??""),unpublishAt:new Date(String(r.unpublish_at)).toISOString(),publishedAt:r.published_at?new Date(String(r.published_at)).toISOString():null})),soon:soon.map(r=>({id:String(r.id),slug:String(r.slug),title:String(r.title),neighborhood:String(r.neighborhood??""),unpublishAt:new Date(String(r.unpublish_at)).toISOString(),publishedAt:r.published_at?new Date(String(r.published_at)).toISOString():null})),review:review.map(r=>({id:String(r.id),slug:String(r.slug),title:String(r.title),neighborhood:String(r.neighborhood??""),publishedAt:r.published_at?new Date(String(r.published_at)).toISOString():null,updatedAt:new Date(String(r.updated_at)).toISOString()}))};};
 if(action==="list")return {...await load(),archived:0,createdTasks:0};
 if(action==="archiveExpired"){const rows=await sql.query<{property_id:string}>(ARCHIVE_EXPIRED_PROPERTIES_SQL,[clean(claims?.displayName,120)||"مدیریت"]);return {...await load(),archived:rows.length,createdTasks:0};}
 if(action==="createTasks"){const data=await load();let createdTasks=0;for(const item of [...data.soon,...data.review]){const inserted=await sql.query<{property_id:string}>(CREATE_PROPERTY_RENEWAL_TASK_SQL,[crypto.randomUUID(),"تمدید فایل: "+item.title,"زمان انتشار نزدیک به پایان است یا فایل بیش از ۹۰ روز آنلاین بوده؛ قیمت و وضعیت آن بررسی شود.",item.id,crypto.randomUUID(),clean(claims?.displayName,120)||"مدیریت"]);if(!inserted.length)continue;createdTasks++;}return {...data,archived:0,createdTasks};}
 if(action==="extend"){const id=clean(body.id,120);const days=Math.max(1,Math.min(365,Number(body.days)||30));if(!id)throw createError({statusCode:400,statusMessage:"شناسه فایل مشخص نیست."});const rows=await sql.query<{property_id:string}>(EXTEND_PROPERTY_EXPIRY_SQL,[id,days,crypto.randomUUID(),clean(claims?.displayName,120)||"مدیریت"]);if(!rows.length)throw createError({statusCode:404,statusMessage:"فایل پیدا نشد."});return {success:true};}
 throw createError({statusCode:400,statusMessage:"عملیات نامعتبر است."});
});
