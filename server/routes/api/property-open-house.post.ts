import { createError, defineEventHandler, getCookie, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
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
    if (action === "list") return { events: [] };
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده برای مدیریت بازدید گروهی تنظیم نشده است." });
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
      const start=new Date(parsed.data.startsAt),end=new Date(parsed.data.endsAt);
      if(!Number.isFinite(start.getTime())||!Number.isFinite(end.getTime())||end<=start) throw createError({statusCode:422,statusMessage:"زمان پایان باید بعد از زمان شروع باشد."});
      if(start.getTime()<Date.now()+15*60*1000) throw createError({statusCode:422,statusMessage:"زمان اوپن‌هاوس باید حداقل ۱۵ دقیقه از اکنون فاصله داشته باشد."});
      const property=await sql.query<{id:string}>("select id from properties where id=$1 and status='published' limit 1",[parsed.data.propertyId]);
      if(!property[0]) throw createError({statusCode:404,statusMessage:"فایل منتشرشده پیدا نشد."});
      const overlaps=await sql.query<{id:string}>("select id from property_open_houses where property_id=$1 and status='scheduled' and starts_at < $3 and ends_at > $2 limit 1",[parsed.data.propertyId,start.toISOString(),end.toISOString()]);
      if(overlaps[0]) throw createError({statusCode:409,statusMessage:"برای این فایل یک بازه بازدید گروهی هم‌پوشان از قبل ثبت شده است."});
      const id=crypto.randomUUID();
      await sql.query("insert into property_open_houses(id,property_id,starts_at,ends_at,capacity,note) values($1,$2,$3,$4,$5,$6)",[id,parsed.data.propertyId,start.toISOString(),end.toISOString(),parsed.data.capacity,parsed.data.note]);
      return {success:true,id};
    }

    if(parsed.data.action==="cancel"){
      await sql.query("update property_open_houses set status='cancelled' where id=$1",[parsed.data.id]);
      await sql.query("update property_open_house_rsvps set status='cancelled' where open_house_id=$1 and status <> 'cancelled'",[parsed.data.id]);
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
  const eventRows=await sql.query<{id:string;property_id:string;capacity:number;starts_at:string;status:string}>("select id,property_id,capacity,starts_at,status from property_open_houses where id=$1 limit 1",[parsed.data.eventId]);
  const openHouse=eventRows[0];
  if(!openHouse||openHouse.status!=="scheduled") throw createError({statusCode:404,statusMessage:"این بازدید گروهی دیگر فعال نیست."});
  if(new Date(String(openHouse.starts_at)).getTime()<=Date.now()) throw createError({statusCode:409,statusMessage:"ثبت‌نام این بازدید بسته شده است."});
  const property=await sql.query<{id:string}>("select id from properties where id=$1 and status='published' limit 1",[openHouse.property_id]);
  if(!property[0]) throw createError({statusCode:404,statusMessage:"فایل موردنظر پیدا نشد."});
  const duplicate=await sql.query<{id:string}>("select id from property_open_house_rsvps where open_house_id=$1 and phone=$2 and status <> 'cancelled' limit 1",[openHouse.id,parsed.data.phone]);
  if(duplicate[0]) throw createError({statusCode:409,statusMessage:"این شماره قبلاً برای این بازدید ثبت‌نام کرده است."});
  const booked=await sql.query<{seats:number}>("select coalesce(sum(party_size),0)::int as seats from property_open_house_rsvps where open_house_id=$1 and status <> 'cancelled'",[openHouse.id]);
  const bookedSeats=Number(booked[0]?.seats)||0;
  if(bookedSeats+parsed.data.partySize>Number(openHouse.capacity)) throw createError({statusCode:409,statusMessage:"ظرفیت این بازدید تکمیل شده است."});
  await sql.query("insert into property_open_house_rsvps(id,open_house_id,name,phone,party_size,note) values($1,$2,$3,$4,$5,$6)",[crypto.randomUUID(),openHouse.id,parsed.data.name,parsed.data.phone,parsed.data.partySize,parsed.data.note]);
  return {success:true,message:"ثبت‌نام شما برای بازدید گروهی انجام شد. هیرمند برای هماهنگی نهایی با شما تماس می‌گیرد.",remainingSeats:Math.max(0,Number(openHouse.capacity)-bookedSeats-parsed.data.partySize)};
});
