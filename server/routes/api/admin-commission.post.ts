import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";
import { compareDecimalStrings, subtractDecimalStrings } from "@/lib/decimal-money";
import { createAdminCommissionSettlement, deleteAdminCommissionSettlement } from "@/lib/admin-deal-lifecycle";
import { updateAdminCommissionStatus } from "@/lib/admin-commission-input";

async function requireAdmin(event:H3Event){
  const token=getCookie(event,ADMIN_SESSION_COOKIE);
  if(!(await verifyAdminSessionToken(token))) throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست."});
  assertSameOrigin(event);
  const claims=await getAdminSessionClaims(token);
  if(!hasAdminPermission(normalizeAdminRole(claims?.role),"commission.manage")) throw createError({statusCode:403,statusMessage:"دسترسی تسویه کمیسیون برای این حساب فعال نیست."});
  return claims;
}
const clean=(v:unknown,max=300)=>typeof v==="string"?v.trim().slice(0,max):"";
const money=(v:unknown)=>{const raw=clean(v,40).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬،,\s]/g,"");return raw&&/^\d{1,20}(?:\.\d+)?$/.test(raw)?raw:null;};
const displayStatus=(v:unknown)=>["pending","approved","paid","cancelled"].includes(String(v))?String(v):"pending";

export default defineEventHandler(async event=>{
  setResponseHeader(event,"cache-control","no-store");
  const claims=await requireAdmin(event);
  if(dbSource==="unconfigured") throw createError({statusCode:503,statusMessage:"پایگاه داده تنظیم نشده است."});
  const sql=await getSql();
  let rawBody:unknown;
  try { rawBody=await readBody(event); }
  catch { throw createError({statusCode:400,statusMessage:"درخواست تسویه معتبر نیست."}); }
  if(!rawBody||typeof rawBody!=="object"||Array.isArray(rawBody)) throw createError({statusCode:400,statusMessage:"درخواست تسویه معتبر نیست."});
  const body=rawBody as Record<string,unknown>;
  const action=clean(body.action,30)||"list";

  if(action==="list"){
    const [rows,deals,summary]=await Promise.all([
      sql.query<Record<string,unknown>>("select s.id,s.consultant,s.deal_id,s.commission_amount,s.consultant_share,s.office_share,s.status,s.paid_at,s.note,s.created_at,d.title as deal_title from admin_commission_settlements s left join admin_deals d on d.id=s.deal_id order by s.updated_at desc limit 200"),
      sql.query<Record<string,unknown>>("select id,title,consultant,commission,status,customer_name from admin_deals where status in ('contracted','completed') order by updated_at desc limit 100"),
      sql.query<Record<string,unknown>>("select count(*) filter(where status='pending')::int as pending,count(*) filter(where status='approved')::int as approved,count(*) filter(where status='paid')::int as paid,coalesce(sum(consultant_share) filter(where status in ('pending','approved')),0)::numeric as total from admin_commission_settlements")
    ]);
    const consultantRows=await sql.query<Record<string,unknown>>("select consultant,count(*)::int as count,coalesce(sum(consultant_share) filter(where status='paid'),0)::numeric as paid,coalesce(sum(consultant_share) filter(where status in ('pending','approved')),0)::numeric as due from admin_commission_settlements where trim(consultant)<>'' group by consultant order by due desc,consultant asc limit 50");
    return {
      settlements:rows.map(r=>({id:String(r.id),consultant:String(r.consultant),dealId:r.deal_id?String(r.deal_id):null,dealTitle:r.deal_title?String(r.deal_title):null,commissionAmount:String(r.commission_amount??"0"),consultantShare:String(r.consultant_share??"0"),officeShare:String(r.office_share??"0"),status:displayStatus(r.status),paidAt:r.paid_at?new Date(String(r.paid_at)).toISOString():null,note:String(r.note??""),createdAt:new Date(String(r.created_at)).toISOString()})),
      deals:deals.map(r=>({id:String(r.id),title:String(r.title),consultant:String(r.consultant??""),commission:String(r.commission??"0"),status:String(r.status),customerName:String(r.customer_name??"")})),
      summary:{pending:Number(summary[0]?.pending)||0,approved:Number(summary[0]?.approved)||0,paid:Number(summary[0]?.paid)||0,total:String(summary[0]?.total??"0"),consultants:consultantRows.map(r=>({name:String(r.consultant),count:Number(r.count)||0,paid:String(r.paid??"0"),due:String(r.due??"0")}))}
    };
  }

  if(action==="create"){
    const consultant=clean(body.consultant,120); const commission=money(body.commission); const consultantShare=money(body.consultantShare);
    if(!consultant||!commission||!consultantShare) throw createError({statusCode:400,statusMessage:"مشاور، کمیسیون و سهم مشاور الزامی است."});
    const dealId=clean(body.dealId,120);
    if(!dealId) throw createError({statusCode:400,statusMessage:"انتخاب یک معامله قراردادی یا نهایی‌شده الزامی است."});
    if(compareDecimalStrings(consultantShare,commission)>0) throw createError({statusCode:400,statusMessage:"سهم مشاور نمی‌تواند بیشتر از کمیسیون کل باشد."});
    const id=crypto.randomUUID();
    const result=await createAdminCommissionSettlement(sql,{
      id,
      consultant,
      dealId,
      commission,
      consultantShare,
      officeShare:subtractDecimalStrings(commission,consultantShare),
      note:clean(body.note,1200),
      createdBy:clean(claims?.displayName,120)||"مدیریت",
    });
    if(result.kind==="deal_required")throw createError({statusCode:400,statusMessage:"انتخاب یک معامله قراردادی یا نهایی‌شده الزامی است."});
    if(result.kind==="deal_not_found")throw createError({statusCode:404,statusMessage:"معامله مرتبط پیدا نشد."});
    if(result.kind==="deal_not_contractual")throw createError({statusCode:409,statusMessage:"برای ثبت تسویه، معامله باید قراردادی یا نهایی‌شده باشد."});
    if(result.kind==="consultant_mismatch")throw createError({statusCode:409,statusMessage:"مشاور تسویه باید با مشاور ثبت‌شده در معامله یکسان باشد."});
    if(result.kind==="commission_mismatch")throw createError({statusCode:409,statusMessage:"مبلغ کمیسیون تسویه باید با کمیسیون ثبت‌شده در معامله یکسان باشد."});
    if(result.kind==="duplicate_active")throw createError({statusCode:409,statusMessage:"برای این معامله قبلاً تسویه فعال ثبت شده است."});
    if(result.kind!=="created")throw createError({statusCode:500,statusMessage:"ثبت تسویه کمیسیون انجام نشد."});
    return {success:true,id};
  }

  const id=clean(body.id,120); if(!id) throw createError({statusCode:400,statusMessage:"شناسه تسویه مشخص نیست."});
  if(action==="status"){
    const result = await updateAdminCommissionStatus(sql, id, body.status);
    if(result.kind==="invalid_status") throw createError({statusCode:400,statusMessage:"وضعیت تسویه معتبر نیست."});
    if(result.kind==="not_found") throw createError({statusCode:404,statusMessage:"تسویه موردنظر پیدا نشد."});
    if(result.kind==="deal_not_contractual") throw createError({statusCode:409,statusMessage:"برای فعال‌کردن تسویه، معامله باید قراردادی یا نهایی‌شده باشد."});
    if(result.kind==="duplicate_active") throw createError({statusCode:409,statusMessage:"برای این معامله تسویه فعال دیگری وجود دارد؛ ابتدا آن را لغو کنید."});
    if(result.kind==="invalid_transition") throw createError({statusCode:409,statusMessage:"تغییر وضعیت با گردش تأیید و پرداخت تسویه سازگار نیست."});
    if(result.kind==="deal_required") throw createError({statusCode:409,statusMessage:"برای فعال‌کردن یا پرداخت تسویه، معامله قراردادی یا نهایی‌شده مرتبط لازم است."});
    if(result.kind==="stale") throw createError({statusCode:409,statusMessage:"اطلاعات ارتباط تسویه تغییر کرده است؛ فهرست را تازه‌سازی کنید."});
    return {success:true};
  }
  if(action==="delete"){
    const result=await deleteAdminCommissionSettlement(sql,id);
    if(result.kind==="not_found")throw createError({statusCode:404,statusMessage:"تسویه موردنظر پیدا نشد."});
    if(result.kind==="not_deletable")throw createError({statusCode:409,statusMessage:"تسویه تأییدشده یا پرداخت‌شده قابل حذف نیست؛ سابقه حسابداری باید حفظ شود."});
    if(result.kind==="stale")throw createError({statusCode:409,statusMessage:"اطلاعات ارتباط تسویه تغییر کرده است؛ دوباره تلاش کنید."});
    return {success:true};
  }
  throw createError({statusCode:400,statusMessage:"عملیات نامعتبر است."});
});
