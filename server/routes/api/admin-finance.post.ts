import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { getAdminSessionClaims } from "@/lib/admin-session.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

type Kind = "income" | "expense";

async function requireAdmin(event:H3Event){
  if(!await verifyAdminSessionToken(getCookie(event,ADMIN_SESSION_COOKIE))){
    throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست. دوباره وارد پنل شوید."});
  }
  assertSameOrigin(event);
  const claims = await getAdminSessionClaims(getCookie(event, ADMIN_SESSION_COOKIE));
  if (!hasAdminPermission(normalizeAdminRole(claims?.role), "finance.manage")) {
    throw createError({ statusCode: 403, statusMessage: "سطح دسترسی مالی برای این حساب فعال نیست." });
  }
}

function parseAmount(value: unknown) {
  const normalized = String(value ?? "")
    .trim()
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[\s٬،,]/g, "");
  if (!normalized || !/^\d+$/.test(normalized)) return null;
  const amount = Number(normalized);
  return Number.isSafeInteger(amount) && amount >= 0 ? amount : null;
}

function tehranCalendarDateNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tehran",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const dateParts = Object.fromEntries(
    parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]),
  );
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function isValidCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (year < 1900 || month < 1 || month > 12 || day < 1) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day <= daysInMonth;
}

export default defineEventHandler(async(event)=>{
  setResponseHeader(event,"cache-control","no-store");
  await requireAdmin(event);
  const body=(await readBody(event).catch(()=>({}))) as {
    action?:"list"|"create"|"delete";
    id?:number;
    kind?:Kind;
    title?:string;
    amount?:unknown;
    transactionDate?:string;
    propertyId?:string;
    leadId?:string;
    consultant?:string;
    category?:string;
    note?:string;
    limit?:number;
  };
  if (dbSource === "unconfigured") {
    if ((body.action ?? "list") === "list") {
      return { transactions: [], summary: { income: 0, expense: 0, balance: 0 } };
    }
    throw createError({ statusCode: 503, statusMessage: "پایگاه داده مالی تنظیم نشده است؛ تغییرات ثبت نشد." });
  }
  const sql=await getSql();

  if((body.action??"list")==="list"){
    const limit=Math.min(200,Math.max(1,Number(body.limit)||100));
    const rows=await sql.query<Record<string,unknown>>(
      `select id,kind,title,amount,transaction_date,property_id,lead_id,consultant,category,note,created_at
       from finance_transactions order by transaction_date desc,created_at desc limit $1`,[limit]);
    const totals=await sql.query<{income:number;expense:number}>(
      "select coalesce(sum(amount) filter(where kind='income'),0)::numeric as income, coalesce(sum(amount) filter(where kind='expense'),0)::numeric as expense from finance_transactions");
    const income=Number(totals[0]?.income)||0, expense=Number(totals[0]?.expense)||0;
    return {transactions:rows.map(r=>({
      id:Number(r.id),kind:String(r.kind) as Kind,title:String(r.title),amount:Number(r.amount)||0,
      transactionDate:String(r.transaction_date),propertyId:r.property_id==null?null:String(r.property_id),
      leadId:r.lead_id==null?null:String(r.lead_id),consultant:String(r.consultant??""),
      category:String(r.category??""),note:String(r.note??""),
      createdAt:new Date(String(r.created_at)).toISOString()
    })),summary:{income,expense,balance:income-expense}};
  }

  if(body.action==="create"){
    const kind=body.kind;
    if(kind!=="income"&&kind!=="expense") throw createError({statusCode:400,statusMessage:"نوع تراکنش نامعتبر است."});
    const amount=parseAmount(body.amount);
    const title=String(body.title??"").trim().slice(0,180);
    if(!title||amount==null||amount<0) throw createError({statusCode:400,statusMessage:"عنوان و مبلغ تراکنش را کامل کنید."});
    const date = body.transactionDate ? String(body.transactionDate) : tehranCalendarDateNow();
    if (!isValidCalendarDate(date)) {
      throw createError({ statusCode: 400, statusMessage: "تاریخ معتبر نیست؛ سال، ماه و روز را بررسی کنید." });
    }
    const row=(await sql.query<Record<string,unknown>>(
      `insert into finance_transactions(kind,title,amount,transaction_date,property_id,lead_id,consultant,category,note)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [kind,title,amount,date,body.propertyId?String(body.propertyId).slice(0,160):null,body.leadId?String(body.leadId).slice(0,160):null,String(body.consultant??"").trim().slice(0,80),String(body.category??"").trim().slice(0,80),String(body.note??"").trim().slice(0,1000)]
    ))[0];
    return {success:true,id:Number(row?.id)};
  }

  if(body.action==="delete"){
    if(!Number.isInteger(body.id)) throw createError({statusCode:400,statusMessage:"شناسه تراکنش نامعتبر است."});
    const row=(await sql.query("delete from finance_transactions where id=$1 returning id",[body.id]))[0];
    if(!row) throw createError({statusCode:404,statusMessage:"تراکنش پیدا نشد."});
    return {success:true};
  }

  throw createError({statusCode:400,statusMessage:"عملیات نامعتبر است."});
});
