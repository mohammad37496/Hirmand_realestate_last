import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql, withSqlTransaction } from "@/lib/db";
import {
  cancelOpenHouseSchedule,
  createOpenHouseSchedule,
  registerOpenHouseRsvp,
} from "@/lib/property-open-house-scheduling.server";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

const phoneSchema=z.string().trim().regex(/^09\d{9}$/,"شماره موبایل معتبر نیست.");
const publicSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("list"),propertyId:z.string().trim().min(1).max(120)}),
  z.object({action:z.literal("rsvp"),eventId:z.string().trim().min(1).max(120),name:z.string().trim().min(2).max(80),phone:phoneSchema,partySize:z.coerce.number().int().min(1).max(10).default(1),note:z.string().trim().max(500).optional().default("")}),
]);
const adminSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("admin_list"),propertyId:z.string().trim().min(1).max(120)}),
  z.object({action:z.literal("create"),propertyId:z.string().trim().min(1).max(120),startsAt:z.string().datetime(),endsAt:z.string().datetime(),capacity:z.coerce.number().int().min(1).max(100).default(8),note:z.string().trim().max(500).optional().default("")}),
  z.object({action:z.literal("cancel"),id:z.string().trim().min(1).max(120)}),
]);
function iso(value:unknown){const d=new Date(String(value));return Number.isFinite(d.getTime())?d.toISOString():"";}

export default defineEventHandler(async(event)=>{
  setResponseHeader(event,"cache-control","no-store");
  const body=await readBody<Record<string, unknown>>(event).catch(()=>({} as Record<string, unknown>));
  const action=String(body?.action??"");
  if (dbSource === "unconfigured") {
    throw createError({ statusCode: 503, statusMessage: "\u067e\u0627\u06cc\u06af\u0627\u0647 \u062f\u0627\u062f\u0647 \u0628\u0631\u0627\u06cc \u0628\u0627\u0632\u06cc\u0627\u0628\u06cc \u0632\u0645\u0627\u0646\u200c\u0647\u0627\u06cc \u0628\u0627\u0632\u062f\u06cc\u062f \u062f\u0631 \u062f\u0633\u062a\u0631\u0633 \u0646\u06cc\u0633\u062a." });
  }
  const sql=await getSql();

  if(action==="admin_list"||action==="create"||action==="cancel"){
    const token = getCookie(event, ADMIN_SESSION_COOKIE);
    if(!await verifyAdminSessionToken(token)) throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست."});
    assertSameOrigin(event);
    const claims = await getAdminSessionClaims(token);
    const permission = action === "admin_list" ? "lead.manage" : "property.manage";
    if (!hasAdminPermission(normalizeAdminRole(claims?.role), permission)) {
      throw createError({ statusCode: 403, statusMessage: "دسترسی مدیریت بازدید گروهی برای این حساب فعال نیست." });
    }
    const parsed=adminSchema.safeParse(body);
    if(!parsed.success) throw createError({statusCode:422,statusMessage:"اطلاعات اوپن‌هاوس معتبر نیست."});

    if(parsed.data.action==="create"){
      const createData=parsed.data;
      const start=new Date(createData.startsAt),end=new Date(createData.endsAt);
      if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start) throw createError({statusCode:422,statusMessage:"زمان پایان باید بعد از زمان شروع باشد."});
      if(start.getTime()<Date.now()+15*60*1000) throw createError({statusCode:422,statusMessage:"زمان اوپن‌هاوس باید حداقل ۱۵ دقیقه از اکنون فاصله داشته باشد."});
      const id=crypto.randomUUID();
      const result=await withSqlTransaction((tx)=>createOpenHouseSchedule(tx,{
        id,
        propertyId:createData.propertyId,
        startsAt:start.toISOString(),
        endsAt:end.toISOString(),
        capacity:createData.capacity,
        note:createData.note,
      }));
      if(result.kind==="property_missing") throw createError({statusCode:404,statusMessage:"فایل منتشرشده پیدا نشد."});
      if(result.kind==="overlap") throw createError({statusCode:409,statusMessage:"برای این فایل یک بازه بازدید گروهی هم‌پوشان از قبل ثبت شده است."});
      return {success:true,id};
    }

    if(parsed.data.action==="cancel"){
      const cancelData=parsed.data;
      const cancelled=await withSqlTransaction((tx)=>cancelOpenHouseSchedule(tx,cancelData.id));
      if(!cancelled) throw createError({statusCode:404,statusMessage:"بازدید گروهی پیدا نشد."});
      return {success:true};
    }

    const property=await sql.query<{id:string}>("select id from properties where id=$1 limit 1",[parsed.data.propertyId]);
    if(!property[0]) throw createError({statusCode:404,statusMessage:"فایل موردنظر پیدا نشد."});
    const events=await sql.query<Record<string,unknown>>("select oh.id,oh.starts_at,oh.ends_at,oh.capacity,oh.note,oh.status,oh.created_at,coalesce(sum(case when r.status <> 'cancelled' then r.party_size else 0 end),0)::int as booked_seats from property_open_houses oh left join property_open_house_rsvps r on r.open_house_id=oh.id where oh.property_id=$1 group by oh.id order by oh.starts_at asc limit 12",[parsed.data.propertyId]);
    const rsvps=await sql.query<Record<string,unknown>>("select r.id,r.open_house_id,r.name,r.phone,r.party_size,r.note,r.status,r.created_at from property_open_house_rsvps r join property_open_houses oh on oh.id=r.open_house_id where oh.property_id=$1 and r.status <> 'cancelled' order by oh.starts_at asc,r.created_at asc limit 200",[parsed.data.propertyId]);
    return {events:events.map(row=>({id:String(row.id),startsAt:iso(row.starts_at),endsAt:iso(row.ends_at),capacity:Number(row.capacity)||0,bookedSeats:Number(row.booked_seats)||0,remainingSeats:Math.max(0,(Number(row.capacity)||0)-(Number(row.booked_seats)||0)),note:String(row.note??""),status:String(row.status??"scheduled")})),rsvps:rsvps.map(row=>({id:String(row.id),eventId:String(row.open_house_id),name:String(row.name??""),phone:String(row.phone??""),partySize:Number(row.party_size)||1,note:String(row.note??""),status:String(row.status??"requested"),createdAt:iso(row.created_at)}))};
  }

  const parsed=publicSchema.safeParse(body);
  if(!parsed.success) throw createError({statusCode:422,statusMessage:"اطلاعات بازدید گروهی معتبر نیست."});
  if(parsed.data.action==="list"){
    const property=await sql.query<{id:string}>("select id from properties where id=$1 and status='published' limit 1",[parsed.data.propertyId]);
    if(!property[0]) return {events:[]};
    const rows=await sql.query<Record<string,unknown>>("select oh.id,oh.starts_at,oh.ends_at,oh.capacity,oh.note,coalesce(sum(case when r.status <> 'cancelled' then r.party_size else 0 end),0)::int as booked_seats from property_open_houses oh left join property_open_house_rsvps r on r.open_house_id=oh.id where oh.property_id=$1 and oh.status='scheduled' and oh.ends_at > current_timestamp group by oh.id order by oh.starts_at asc limit 5",[parsed.data.propertyId]);
    return {events:rows.map(row=>({id:String(row.id),startsAt:iso(row.starts_at),endsAt:iso(row.ends_at),capacity:Number(row.capacity)||0,bookedSeats:Number(row.booked_seats)||0,remainingSeats:Math.max(0,(Number(row.capacity)||0)-(Number(row.booked_seats)||0)),note:String(row.note??"")}))};
  }

  const throttle=await consumeAdminAttempt("open-house-rsvp:"+clientFingerprint(event));
  if(!throttle.allowed) throw createError({statusCode:429,statusMessage:"ثبت‌نام بازدید گروهی بیش از حد مجاز انجام شده است. کمی بعد دوباره تلاش کنید."});
  assertSameOrigin(event);
  const rsvpData=parsed.data;
  const result=await withSqlTransaction((tx)=>registerOpenHouseRsvp(tx,{
    id:crypto.randomUUID(),
    eventId:rsvpData.eventId,
    name:rsvpData.name,
    phone:rsvpData.phone,
    partySize:rsvpData.partySize,
    note:rsvpData.note,
  }));
  if(result.kind==="not_found"||result.kind==="inactive") throw createError({statusCode:404,statusMessage:"این بازدید گروهی دیگر فعال نیست."});
  if(result.kind==="closed") throw createError({statusCode:409,statusMessage:"ثبت‌نام این بازدید بسته شده است."});
  if(result.kind==="property_unavailable") throw createError({statusCode:404,statusMessage:"فایل موردنظر پیدا نشد."});
  if(result.kind==="duplicate") throw createError({statusCode:409,statusMessage:"این شماره قبلاً برای این بازدید ثبت‌نام کرده است."});
  if(result.kind==="full") throw createError({statusCode:409,statusMessage:"ظرفیت این بازدید تکمیل شده است."});
  return {success:true,message:"ثبت‌نام شما برای بازدید گروهی انجام شد. هیرمند برای هماهنگی نهایی با شما تماس می‌گیرد.",remainingSeats:result.remainingSeats};
});
