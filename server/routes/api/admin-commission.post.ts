import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql, withSqlTransaction } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

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
const validStatus=(v:unknown)=>["pending","approved","paid","cancelled"].includes(String(v))?String(v):"pending";

export default defineEventHandler(async event=>{
  setResponseHeader(event,"cache-control","no-store");
  const claims=await requireAdmin(event);
  if(dbSource==="unconfigured") throw createError({statusCode:503,statusMessage:"پایگاه داده کمیسیون در دسترس نیست؛ اطلاعات بارگذاری نشد."});
  const sql=await getSql();
  const body=(await readBody(event).catch(()=>({}))) as Record<string,unknown>;
  const action=clean(body.action,30)||"list";

  if(action==="list"){
    const [rows,deals,summary]=await Promise.all([
      sql.query<Record<string,unknown>>("select s.id,s.consultant,s.deal_id,s.commission_amount,s.consultant_share,s.office_share,s.status,s.paid_at,s.note,s.created_at,d.title as deal_title from admin_commission_settlements s left join admin_deals d on d.id=s.deal_id order by s.updated_at desc limit 200"),
      sql.query<Record<string,unknown>>("select id,title,consultant,commission,status,customer_name from admin_deals where status in ('contracted','completed') order by updated_at desc limit 100"),
      sql.query<Record<string,unknown>>("select count(*) filter(where status='pending')::int as pending,count(*) filter(where status='approved')::int as approved,count(*) filter(where status='paid')::int as paid,coalesce(sum(consultant_share) filter(where status in ('pending','approved')),0)::numeric as total from admin_commission_settlements")
    ]);
    const consultantRows=await sql.query<Record<string,unknown>>("select consultant,count(*)::int as count,coalesce(sum(consultant_share) filter(where status='paid'),0)::numeric as paid,coalesce(sum(consultant_share) filter(where status in ('pending','approved')),0)::numeric as due from admin_commission_settlements where trim(consultant)<>'' group by consultant order by due desc,consultant asc limit 50");
    return {
      settlements:rows.map(r=>({id:String(r.id),consultant:String(r.consultant),dealId:r.deal_id?String(r.deal_id):null,dealTitle:r.deal_title?String(r.deal_title):null,commissionAmount:Number(r.commission_amount)||0,consultantShare:Number(r.consultant_share)||0,officeShare:Number(r.office_share)||0,status:validStatus(r.status),paidAt:r.paid_at?new Date(String(r.paid_at)).toISOString():null,note:String(r.note??""),createdAt:new Date(String(r.created_at)).toISOString()})),
      deals:deals.map(r=>({id:String(r.id),title:String(r.title),consultant:String(r.consultant??""),commission:Number(r.commission)||0,status:String(r.status),customerName:String(r.customer_name??"")})),
      summary:{pending:Number(summary[0]?.pending)||0,approved:Number(summary[0]?.approved)||0,paid:Number(summary[0]?.paid)||0,total:Number(summary[0]?.total)||0,consultants:consultantRows.map(r=>({name:String(r.consultant),count:Number(r.count)||0,paid:Number(r.paid)||0,due:Number(r.due)||0}))}
    };
  }

  if(action==="create"){
    const consultant=clean(body.consultant,120); const commission=money(body.commission); const consultantShare=money(body.consultantShare);
    if(!consultant||!commission||!consultantShare) throw createError({statusCode:400,statusMessage:"مشاور، کمیسیون و سهم مشاور الزامی است."});
    const commissionNumber=Number(commission), consultantNumber=Number(consultantShare);
    if(!Number.isSafeInteger(commissionNumber)||!Number.isSafeInteger(consultantNumber)||commissionNumber<=0||consultantNumber<0)throw createError({statusCode:400,statusMessage:"مبالغ کمیسیون باید عدد صحیح و در محدوده مجاز باشند."});
    if(consultantNumber>commissionNumber) throw createError({statusCode:400,statusMessage:"سهم مشاور نمی‌تواند بیشتر از کمیسیون کل باشد."});
    const dealId=clean(body.dealId,120)||null;
    const id=crypto.randomUUID();
    const insertSettlement = async (tx: Awaited<ReturnType<typeof getSql>>) => {
      if(dealId){
        const linkedDeal=await tx.query<Record<string,unknown>>("select consultant,commission,status from admin_deals where id=$1 for update",[dealId]);
        if(!linkedDeal.length)throw createError({statusCode:404,statusMessage:"معامله مرتبط پیدا نشد."});
        const deal=linkedDeal[0];
        if(!["contracted","completed"].includes(String(deal.status)))throw createError({statusCode:409,statusMessage:"تسویه فقط برای معامله قراردادی یا نهایی‌شده امکان‌پذیر است."});
        if(String(deal.consultant??"").trim()&&String(deal.consultant).trim()!==consultant)throw createError({statusCode:409,statusMessage:"نام مشاور با مشاور ثبت‌شده در معامله مطابقت ندارد."});
        if(deal.commission==null||Number(deal.commission)!==commissionNumber)throw createError({statusCode:409,statusMessage:"مبلغ کمیسیون باید با مبلغ ثبت‌شده در معامله یکسان باشد."});
        const existingSettlement=await tx.query("select id from admin_commission_settlements where deal_id=$1 and status<>'cancelled' limit 1",[dealId]);
        if(existingSettlement.length)throw createError({statusCode:409,statusMessage:"برای این معامله قبلاً یک تسویه فعال ثبت شده است."});
      }
      await tx.query("insert into admin_commission_settlements(id,consultant,deal_id,commission_amount,consultant_share,office_share,status,note,created_by) values($1,$2,$3,$4,$5,$6,'pending',$7,$8)",
        [id,consultant,dealId,commissionNumber,consultantNumber,commissionNumber-consultantNumber,clean(body.note,1200),clean(claims?.displayName,120)||"مدیریت"]);
    };
    try {
      if(dealId) await withSqlTransaction(insertSettlement);
      else await insertSettlement(sql);
    } catch (error) {
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
      if(code === "23503") throw createError({statusCode:409,statusMessage:"معامله در همین زمان حذف شده است؛ تسویه ثبت نشد."});
      throw error;
    }
    return {success:true,id};
  }

  const id=clean(body.id,120); if(!id) throw createError({statusCode:400,statusMessage:"شناسه تسویه مشخص نیست."});
  if(action==="status"){
    if(!["pending","approved","paid","cancelled"].includes(String(body.status)))throw createError({statusCode:400,statusMessage:"وضعیت تسویه معتبر نیست."});
    const status=String(body.status);
    const updated=await sql.query("update admin_commission_settlements set status=$2,paid_at=case when $2='paid' then coalesce(paid_at,current_timestamp) else null end,updated_at=current_timestamp where id=$1 and (status=$2 or (status='pending' and $2 in ('approved','cancelled')) or (status='approved' and $2 in ('paid','cancelled')) or (status='cancelled' and $2='pending')) returning id",[id,status]);
    if(!updated.length){
      const exists=await sql.query("select id from admin_commission_settlements where id=$1 limit 1",[id]);
      if(!exists.length)throw createError({statusCode:404,statusMessage:"تسویه پیدا نشد؛ وضعیت تغییر نکرد."});
      throw createError({statusCode:409,statusMessage:"تغییر وضعیت با گردش تأیید و پرداخت تسویه سازگار نیست."});
    }
    return {success:true};
  }
  if(action==="delete"){
    const deleted=await sql.query("delete from admin_commission_settlements where id=$1 and status in ('pending','cancelled') returning id",[id]);
    if(!deleted.length){
      const exists=await sql.query("select id from admin_commission_settlements where id=$1 limit 1",[id]);
      if(!exists.length)throw createError({statusCode:404,statusMessage:"تسویه پیدا نشد."});
      throw createError({statusCode:409,statusMessage:"تسویه تأییدشده یا پرداخت‌شده قابل حذف نیست."});
    }
    return {success:true};
  }
  throw createError({statusCode:400,statusMessage:"عملیات نامعتبر است."});
});
