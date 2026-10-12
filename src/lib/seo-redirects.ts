import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { verifyAdminSessionToken, ADMIN_SESSION_COOKIE } from "@/lib/admin-session.server";
import { getCookie } from "@tanstack/react-start/server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";

export type RedirectRow={id:number;sourcePath:string;targetPath:string;statusCode:301|302|307|308;active:boolean;hitCount:number;lastHitAt:string|null;createdAt:string;updatedAt:string};
type NotFoundRow={id:number;path:string;hitCount:number;referrer:string;userAgent:string;firstSeenAt:string;lastSeenAt:string};
const statusSchema=z.union([z.literal(301),z.literal(302),z.literal(307),z.literal(308)]);

function cleanSource(value:string){
  const raw=value.trim();
  if(!raw.startsWith("/")||raw.startsWith("//")||raw.includes("#")) throw new Error("مسیر مبدأ باید با / شروع شود و بدون # باشد.");
  return raw.slice(0,500);
}
function cleanTarget(value:string){
  const raw=value.trim();
  if(raw.startsWith("//")||raw.startsWith("javascript:")||raw.startsWith("data:")) throw new Error("مقصد نامعتبر است.");
  if(!(raw.startsWith("/")||raw.startsWith("https://")||raw.startsWith("http://"))) throw new Error("مقصد باید یک مسیر /... یا URL وب باشد.");
  return raw.slice(0,1000);
}
function mapRedirect(row:Record<string,unknown>):RedirectRow{return{
  id:Number(row.id)||0,sourcePath:String(row.source_path??""),targetPath:String(row.target_path??""),
  statusCode:Number(row.status_code) as RedirectRow["statusCode"],active:Boolean(row.active),hitCount:Number(row.hit_count)||0,
  lastHitAt:row.last_hit_at?new Date(String(row.last_hit_at)).toISOString():null,
  createdAt:new Date(String(row.created_at)).toISOString(),updatedAt:new Date(String(row.updated_at)).toISOString(),
};}
function map404(row:Record<string,unknown>):NotFoundRow{return{
  id:Number(row.id)||0,path:String(row.path??""),hitCount:Number(row.hit_count)||0,referrer:String(row.referrer??""),userAgent:String(row.user_agent??""),
  firstSeenAt:new Date(String(row.first_seen_at)).toISOString(),lastSeenAt:new Date(String(row.last_seen_at)).toISOString(),
};}

async function requireAdmin(){
  const token=getCookie(ADMIN_SESSION_COOKIE);
  if(!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
}

// A plain exported helper here used to keep this whole module — and with it
// `@/lib/db` and `node:fs` — in the browser bundle, which broke every route
// that imported a redirect server function. It had no callers; if it is needed
// again it belongs in a `.server` module like `admin-audit-log.server`.

export const listAdminRedirects=createServerFn({method:"POST"}).validator(z.object({limit:z.number().int().min(1).max(200).default(100)})).handler(async({data})=>{
  await requireAdmin(); if(dbSource==="unconfigured") return [];
  const sql=await getSql(); const rows=await sql.query<Record<string,unknown>>(
    `select id,source_path,target_path,status_code,active,hit_count,last_hit_at,created_at,updated_at
     from site_redirects order by updated_at desc,id desc limit $1`,[data.limit]);
  return rows.map(mapRedirect);
});

export const upsertAdminRedirect=createServerFn({method:"POST"}).validator(z.object({
  id:z.number().int().positive().optional(),sourcePath:z.string().min(1).max(500),targetPath:z.string().min(1).max(1000),
  statusCode:statusSchema,active:z.boolean()
})).handler(async({data})=>{
  await requireAdmin(); if(dbSource==="unconfigured") throw new Error("پایگاه داده تنظیم نشده است.");
  const source=cleanSource(data.sourcePath), target=cleanTarget(data.targetPath);
  if(source===target) throw new Error("مبدأ و مقصد ریدایرکت نباید یکسان باشند.");
  const sql=await getSql();
  const rows= data.id
    ? await sql.query<Record<string,unknown>>(
        `update site_redirects
         set source_path=$2,target_path=$3,status_code=$4,active=$5,updated_at=current_timestamp
         where id=$1
         returning id,source_path,target_path,status_code,active,hit_count,last_hit_at,created_at,updated_at`,
        [data.id,source,target,data.statusCode,data.active],
      )
    : await sql.query<Record<string,unknown>>(
        `insert into site_redirects(source_path,target_path,status_code,active,updated_at)
         values ($1,$2,$3,$4,current_timestamp)
         on conflict (source_path) do update set
           target_path=excluded.target_path,status_code=excluded.status_code,active=excluded.active,updated_at=current_timestamp
         returning id,source_path,target_path,status_code,active,hit_count,last_hit_at,created_at,updated_at`,
        [source,target,data.statusCode,data.active],
      );
  return mapRedirect(rows[0]!);
});

export const deleteAdminRedirect=createServerFn({method:"POST"}).validator(z.object({id:z.number().int().positive()})).handler(async({data})=>{
  await requireAdmin(); if(dbSource==="unconfigured") return {success:true};
  const sql=await getSql(); await sql.query("delete from site_redirects where id=$1",[data.id]); return {success:true};
});

export const listAdmin404Logs=createServerFn({method:"POST"}).validator(z.object({limit:z.number().int().min(1).max(200).default(100)})).handler(async({data})=>{
  await requireAdmin(); if(dbSource==="unconfigured") return [];
  const sql=await getSql(); const rows=await sql.query<Record<string,unknown>>(
    `select id,path,hit_count,referrer,user_agent,first_seen_at,last_seen_at
     from site_404_logs order by hit_count desc,last_seen_at desc limit $1`,[data.limit]);
  return rows.map(map404);
});

export const clearAdmin404Logs=createServerFn({method:"POST"}).validator(z.object({beforeDays:z.number().int().min(1).max(3650).default(30)})).handler(async({data})=>{
  await requireAdmin(); if(dbSource==="unconfigured") return {deleted:0};
  const sql=await getSql(); const rows=await sql.query("delete from site_404_logs where last_seen_at < current_timestamp - ($1::text || ' days')::interval returning id",[String(data.beforeDays)]);
  return {deleted:rows.length};
});

export const trackPublic404=createServerFn({method:"POST"}).validator(z.object({
  path:z.string().min(1).max(500),referrer:z.string().max(1000).optional().default(""),userAgent:z.string().max(500).optional().default("")
})).handler(async({data})=>{
  if(dbSource==="unconfigured") return {success:true};
  if(data.path.startsWith("/api/")) return {success:true};
  try{
    const sql=await getSql();
    await sql.query(
      `insert into site_404_logs(path,hit_count,referrer,user_agent,first_seen_at,last_seen_at)
       values($1,1,$2,$3,current_timestamp,current_timestamp)
       on conflict(path) do update set
         hit_count=site_404_logs.hit_count+1,
         referrer=excluded.referrer,
         user_agent=excluded.user_agent,
         last_seen_at=current_timestamp`,
      [data.path.slice(0,500),data.referrer.slice(0,1000),data.userAgent.slice(0,500)]
    );
  }catch{
    // 404 logging is best-effort: never surface a DB hiccup to the visitor.
  }
  return {success:true};
});
