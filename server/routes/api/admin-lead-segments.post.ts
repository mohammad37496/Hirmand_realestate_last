import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const STATUSES=["all","new","contacted","follow_up","visited","contract","closed","spam"];
const SORTS=["newest","oldest","name","follow_up","priority"];
const clean=(v:unknown,max=120)=>typeof v==="string"?v.trim().slice(0,max):"";

export default defineEventHandler(async event=>{
 setResponseHeader(event,"cache-control","no-store");
 const token=getCookie(event,ADMIN_SESSION_COOKIE);
 if(!(await verifyAdminSessionToken(token)))throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست."});
 assertSameOrigin(event);
 const claims=await getAdminSessionClaims(token);
 if(!hasAdminPermission(normalizeAdminRole(claims?.role),"lead.manage"))throw createError({statusCode:403,statusMessage:"دسترسی مدیریت CRM برای این حساب فعال نیست."});
 if(dbSource==="unconfigured")return{segments:[]};
 const sql=await getSql(); const body=(await readBody(event).catch(()=>({}))) as Record<string,unknown>;
 const action=clean(body.action,30)||"list";
 if(action==="list"){
  const rows=await sql.query<Record<string,unknown>>("select id,title,query,status,sort,created_at,updated_at from admin_saved_lead_segments order by updated_at desc");
  const segments=[];
  for(const row of rows){
   const status=STATUSES.includes(String(row.status))?String(row.status):"all";
   const sort=SORTS.includes(String(row.sort))?String(row.sort):"priority";
   const q=clean(row.query,80);
   const params:any[]=[]; const conditions=["true"];
   if(status!=="all"){params.push(status);conditions.push(`status=$${params.length}`);}
   if(q){params.push("%"+q+"%");const i=params.length;conditions.push("(name ilike $"+i+" or phone ilike $"+i+" or neighborhood ilike $"+i+" or consultant ilike $"+i+" or note ilike $"+i+")");}
   const count=await sql.query<{count:number}>(`select count(*)::int as count from leads where ${conditions.join(" and ")}`,params);
   segments.push({id:String(row.id),title:String(row.title),query:q,status,sort,matchCount:Number(count[0]?.count)||0});
  }
  return {segments};
 }
 if(action==="save"){
  const id=clean(body.id,80)||crypto.randomUUID(), title=clean(body.title,100), query=clean(body.query,80);
  const status=STATUSES.includes(String(body.status))?String(body.status):"all", sort=SORTS.includes(String(body.sort))?String(body.sort):"priority";
  if(!title)throw createError({statusCode:400,statusMessage:"نام لیست هوشمند الزامی است."});
  await sql.query("insert into admin_saved_lead_segments(id,title,query,status,sort,created_by) values($1,$2,$3,$4,$5,$6) on conflict(id) do update set title=excluded.title,query=excluded.query,status=excluded.status,sort=excluded.sort,updated_at=current_timestamp",[id,title,query,status,sort,clean(claims?.displayName,120)||"مدیریت"]);
  return{success:true,id};
 }
 if(action==="delete"){
  const id=clean(body.id,80);if(!id)throw createError({statusCode:400,statusMessage:"شناسه لیست مشخص نیست."});
  await sql.query("delete from admin_saved_lead_segments where id=$1",[id]);return{success:true};
 }
 throw createError({statusCode:400,statusMessage:"عملیات لیست هوشمند نامعتبر است."});
});