import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const publicActionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("list"),propertyId:z.string().trim().min(1).max(120)}),
  z.object({action:z.literal("ask"),propertyId:z.string().trim().min(1).max(120),question:z.string().trim().min(8).max(600)}),
]);
const adminActionSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("admin_list"),propertyId:z.string().trim().min(1).max(120)}),
  z.object({action:z.literal("answer"),id:z.string().trim().min(1).max(120),answer:z.string().trim().min(2).max(1200)}),
  z.object({action:z.literal("hide"),id:z.string().trim().min(1).max(120)}),
]);
function statusLabel(status:string){return status==="answered"?"پاسخ داده‌شده":status==="hidden"?"پنهان":"در انتظار پاسخ";}

export default defineEventHandler(async(event)=>{
  setResponseHeader(event,"cache-control","no-store");
  const body=await readBody<Record<string, unknown>>(event).catch(()=>({} as Record<string, unknown>));
  const action=String(body?.action??"");
  if (dbSource === "unconfigured") {
    if (action === "list" || action === "admin_list") return { questions: [] };
    if (action === "ask") return { success: true, accepted: false };
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده برای مدیریت پرسش‌های ملک تنظیم نشده است." });
  }

  if(action==="admin_list"||action==="answer"||action==="hide"){
    const token = getCookie(event, ADMIN_SESSION_COOKIE);
    if(!await verifyAdminSessionToken(token)) throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست."});
    assertSameOrigin(event);
    const claims = await getAdminSessionClaims(token);
    if (!hasAdminPermission(normalizeAdminRole(claims?.role), "property.manage")) {
      throw createError({ statusCode: 403, statusMessage: "دسترسی پاسخ‌گویی و مدیریت پرسش‌های فایل برای این حساب فعال نیست." });
    }
    const parsed=adminActionSchema.safeParse(body);
    if(!parsed.success) throw createError({statusCode:422,statusMessage:"درخواست مدیریت پرسش معتبر نیست."});
    const sql=await getSql();
    if(parsed.data.action==="admin_list"){
      const property=await sql.query<{id:string}>("select id from properties where id=$1 limit 1",[parsed.data.propertyId]);
      if(!property[0]) throw createError({statusCode:404,statusMessage:"فایل موردنظر پیدا نشد."});
      const rows=await sql.query<Record<string,unknown>>("select id,question,answer,status,created_at,answered_at from property_questions where property_id=$1 order by case status when 'pending' then 0 when 'answered' then 1 else 2 end,created_at desc limit 80",[parsed.data.propertyId]);
      return {questions:rows.map(row=>({id:String(row.id),question:String(row.question??""),answer:String(row.answer??""),status:String(row.status??"pending"),statusLabel:statusLabel(String(row.status??"pending")),createdAt:new Date(String(row.created_at)).toISOString(),answeredAt:row.answered_at?new Date(String(row.answered_at)).toISOString():null}))};
    }
    if(parsed.data.action==="answer"){
      const rows=await sql.query<{id:string;property_id:string}>("select id,property_id from property_questions where id=$1 limit 1",[parsed.data.id]);
      if(!rows[0]) throw createError({statusCode:404,statusMessage:"پرسش پیدا نشد."});
      await sql.query("update property_questions set answer=$2,status='answered',answered_at=current_timestamp where id=$1",[parsed.data.id,parsed.data.answer]);
      return {success:true,propertyId:rows[0].property_id};
    }
    await sql.query("update property_questions set status='hidden' where id=$1",[parsed.data.id]);
    return {success:true};
  }

  const parsed=publicActionSchema.safeParse(body);
  if(!parsed.success) throw createError({statusCode:422,statusMessage:"اطلاعات پرسش معتبر نیست."});
  const sql=await getSql();
  const property=await sql.query<{id:string}>("select id from properties where id=$1 and status='published' limit 1",[parsed.data.propertyId]);
  if(!property[0]) throw createError({statusCode:404,statusMessage:"فایل موردنظر پیدا نشد."});
  if(parsed.data.action==="list"){
    const rows=await sql.query<Record<string,unknown>>("select id,question,answer,created_at,answered_at from property_questions where property_id=$1 and status='answered' order by answered_at desc nulls last,created_at desc limit 30",[parsed.data.propertyId]);
    return {questions:rows.map(row=>({id:String(row.id),question:String(row.question??""),answer:String(row.answer??""),createdAt:new Date(String(row.created_at)).toISOString(),answeredAt:row.answered_at?new Date(String(row.answered_at)).toISOString():null}))};
  }
  const throttle=await consumeAdminAttempt("property-question:"+clientFingerprint(event));
  if(!throttle.allowed) throw createError({statusCode:429,statusMessage:"ارسال پرسش بیش از حد مجاز انجام شده است. کمی بعد دوباره تلاش کنید."});
  assertSameOrigin(event);
  await sql.query("insert into property_questions(id,property_id,question) values($1,$2,$3)",[crypto.randomUUID(),parsed.data.propertyId,parsed.data.question]);
  return {success:true,accepted:true,message:"سؤال شما ثبت شد و پس از بررسی نمایش داده می‌شود."};
});
