import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getCookie } from "@tanstack/react-start/server";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertAdminServerFnOrigin } from "@/lib/admin-server-fn-guard.server";
import { getAdminSessionClaims } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import {
  DEFAULT_FAQS,
  DEFAULT_GUIDES,
  type FaqContent,
  type GuideContent,
} from "@/lib/site-content-static";
// Re-exported for server-side callers; client components import
// `@/lib/site-content-static` directly so this module stays splittable.
export { DEFAULT_FAQS, DEFAULT_GUIDES, buildFaqJsonLd } from "@/lib/site-content-static";
export type { FaqContent, GuideContent } from "@/lib/site-content-static";

async function requireAdmin(){
  const token = getCookie(ADMIN_SESSION_COOKIE);
  if(!(await verifyAdminSessionToken(token))) throw new Error("نشست مدیریت معتبر نیست.");
  assertAdminServerFnOrigin();
  const claims = await getAdminSessionClaims(token);
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "content.manage")) {
    throw new Error("سطح دسترسی محتوا برای این حساب فعال نیست.");
  }
}

function text(value:unknown){return String(value??"").trim();}
function bodyRecord(value:unknown):Record<string,unknown>{return value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};}
function mapGuide(row:Record<string,unknown>):GuideContent{
  const body=bodyRecord(row.body); const raw=Array.isArray(body.points)?body.points:[];
  return {id:text(row.id),category:text(row.category),title:text(row.title),summary:text(row.summary),points:raw.map(text).filter(Boolean),sortOrder:Number(row.sort_order)||0,active:row.active==null?true:Boolean(row.active)};
}
function mapFaq(row:Record<string,unknown>):FaqContent{
  const body=bodyRecord(row.body);
  return {id:text(row.id),category:text(row.category)||"عمومی",question:text(row.title),answer:text(body.answer),sortOrder:Number(row.sort_order)||0,active:row.active==null?true:Boolean(row.active)};
}

async function ensureSeeded(){
  if(dbSource==="unconfigured") return;
  const sql=await getSql();
  const countRows=await sql.query<{count:number}>("select count(*)::int as count from site_content_items");
  if(Number(countRows[0]?.count)>0) return;
  const items=[
    ...DEFAULT_GUIDES.map((item,index)=>({id:item.id,kind:"guide",category:item.category,title:item.title,summary:item.summary,body:{points:item.points},sortOrder:index*10})),
    ...DEFAULT_FAQS.map((item,index)=>({id:item.id,kind:"faq",category:item.category,title:item.question,summary:"",body:{answer:item.answer},sortOrder:index*10})),
  ];
  const values=items.map((_,i)=>`($${i*7+1},$${i*7+2},$${i*7+3},$${i*7+4},$${i*7+5},$${i*7+6},$${i*7+7},true)`).join(",");
  const params:unknown[]=[];
  for(const item of items) params.push(item.id,item.kind,item.category,item.title,item.summary,JSON.stringify(item.body),item.sortOrder);
  await sql.query(
    `insert into site_content_items(id,kind,category,title,summary,body,sort_order,active) values ${values}
     on conflict(id) do nothing`,params
  );
}

export const getPublicGuides=createServerFn({method:"GET"}).handler(async()=>{
  if(dbSource==="unconfigured") return DEFAULT_GUIDES;
  try{
    await ensureSeeded(); const sql=await getSql();
    const rows=await sql.query<Record<string,unknown>>(
      "select id,category,title,summary,body,sort_order,active from site_content_items where kind='guide' and active=true order by sort_order asc,updated_at desc");
    const items=rows.map(mapGuide).filter(item=>item.id&&item.title&&item.points.length);
    return items;
  }catch{return DEFAULT_GUIDES;}
});

export const getPublicFaqs=createServerFn({method:"GET"}).handler(async()=>{
  if(dbSource==="unconfigured") return DEFAULT_FAQS;
  try{
    await ensureSeeded(); const sql=await getSql();
    const rows=await sql.query<Record<string,unknown>>(
      "select id,category,title,body,sort_order,active from site_content_items where kind='faq' and active=true order by sort_order asc,updated_at desc");
    const items=rows.map(mapFaq).filter(item=>item.id&&item.question&&item.answer);
    return items;
  }catch{return DEFAULT_FAQS;}
});

export const listAdminSiteContent=createServerFn({method:"POST"}).validator(z.object({kind:z.enum(["guide","faq"]).optional()})).handler(async({data})=>{
  await requireAdmin();
  if(dbSource==="unconfigured") return {guides:DEFAULT_GUIDES,faqs:DEFAULT_FAQS};
  await ensureSeeded(); const sql=await getSql();
  const rows=await sql.query<Record<string,unknown>>(
    `select id,kind,category,title,summary,body,sort_order,active,updated_at
     from site_content_items
     where ($1::text='' or kind=$1)
     order by kind asc,sort_order asc,updated_at desc`,[data.kind??""]
  );
  return {
    guides:rows.filter(r=>r.kind==="guide").map(mapGuide),
    faqs:rows.filter(r=>r.kind==="faq").map(mapFaq),
  };
});

export const upsertAdminSiteContent=createServerFn({method:"POST"}).validator(z.object({
  id:z.string().trim().min(2).max(80).regex(/^[a-z0-9-]+$/i).optional(),
  kind:z.enum(["guide","faq"]),
  category:z.string().trim().max(80).default("عمومی"),
  title:z.string().trim().min(3).max(220),
  summary:z.string().trim().max(500).default(""),
  answer:z.string().trim().max(4000).default(""),
  points:z.array(z.string().trim().min(1).max(700)).max(12).default([]),
  sortOrder:z.number().int().min(-10000).max(10000).default(0),
  active:z.boolean().default(true),
})).handler(async({data})=>{
  await requireAdmin(); if(dbSource==="unconfigured") throw new Error("پایگاه داده تنظیم نشده است.");
  const id=data.id??`${data.kind}-${Date.now().toString(36)}`;
  if(data.kind==="guide" && !data.points.length) throw new Error("راهنما حداقل باید یک نکته داشته باشد.");
  if(data.kind==="faq" && !data.answer) throw new Error("پاسخ پرسش را وارد کنید.");
  const body=data.kind==="guide"?JSON.stringify({points:data.points}):JSON.stringify({answer:data.answer});
  const sql=await getSql();
  const rows=await sql.query<Record<string,unknown>>(
    `insert into site_content_items(id,kind,category,title,summary,body,sort_order,active,updated_at)
     values($1,$2,$3,$4,$5,$6::jsonb,$7,$8,current_timestamp)
     on conflict(id) do update set kind=excluded.kind,category=excluded.category,title=excluded.title,summary=excluded.summary,body=excluded.body,sort_order=excluded.sort_order,active=excluded.active,updated_at=current_timestamp
     returning id,kind,category,title,summary,body,sort_order,active,updated_at`,
    [id,data.kind,data.category,data.title,data.summary,body,data.sortOrder,data.active]
  );
  return data.kind==="guide"?mapGuide(rows[0]!):mapFaq(rows[0]!);
});

export const deleteAdminSiteContent=createServerFn({method:"POST"}).validator(z.object({id:z.string().trim().min(2).max(80)})).handler(async({data})=>{
  await requireAdmin(); if(dbSource==="unconfigured") return {success:true};
  const sql=await getSql(); await sql.query("delete from site_content_items where id=$1",[data.id]); return {success:true};
});
