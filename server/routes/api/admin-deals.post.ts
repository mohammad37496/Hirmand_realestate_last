import { createError, defineEventHandler, getCookie, readBody, setResponseHeader, type H3Event } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { ADMIN_SESSION_COOKIE, getAdminSessionClaims, verifyAdminSessionToken } from "@/lib/admin-session.server";
import { assertSameOrigin } from "@/lib/admin-rate-limit.server";
import { hasAdminPermission, normalizeAdminRole } from "@/lib/admin-roles";

type DealStatus = "prospect"|"negotiation"|"agreement"|"contracted"|"completed"|"cancelled";
type DealType = "sale"|"rent"|"mortgage"|"buy";
type DocStatus = "pending"|"received"|"verified"|"rejected";
const DEFAULT_DOCUMENTS=["کارت ملی / شناسنامه","سند یا مدرک مالکیت","مدارک هویتی طرفین","مبایعه‌نامه / اجاره‌نامه","کد رهگیری","رسید بیعانه / ودیعه","استعلام‌ها و پایان‌کار","تسویه و رسید نهایی"];

async function requireDealsPermission(event:H3Event){
  const token=getCookie(event,ADMIN_SESSION_COOKIE);
  if(!(await verifyAdminSessionToken(token)))throw createError({statusCode:401,statusMessage:"نشست مدیریت معتبر نیست."});
  assertSameOrigin(event); const claims=await getAdminSessionClaims(token);
  if(!hasAdminPermission(normalizeAdminRole(claims?.role),"deal.manage"))throw createError({statusCode:403,statusMessage:"دسترسی معاملات برای این حساب فعال نیست."});
  return claims;
}
const clean=(v:unknown,max=300)=>typeof v==="string"?v.trim().slice(0,max):"";
function money(v:unknown){const raw=clean(v,40).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬،,\s]/g,"");return raw&&/^\d{1,20}(?:\.\d+)?$/.test(raw)?raw:null;}
const validStatus=(v:unknown):DealStatus=>["prospect","negotiation","agreement","contracted","completed","cancelled"].includes(String(v))?String(v) as DealStatus:"prospect";
const validType=(v:unknown):DealType=>["sale","rent","mortgage","buy"].includes(String(v))?String(v) as DealType:"sale";

export default defineEventHandler(async event=>{
  setResponseHeader(event,"cache-control","no-store"); const claims=await requireDealsPermission(event);
  if(dbSource==="unconfigured")return {deals:[],leads:[],properties:[],stats:{}};
  const sql=await getSql(); const body=(await readBody(event).catch(()=>({}))) as Record<string,unknown>; const action=clean(body.action,30)||"list";
  if(action==="list"){
    const [deals,leads,properties,stats]=await Promise.all([
      sql.query<Record<string,unknown>>("select d.id,d.lead_id,d.property_id,d.title,d.deal_type,d.status,d.customer_name,d.customer_phone,d.consultant,d.amount,d.commission,d.contract_number,d.contract_date,d.closing_date,d.notes,d.created_at,d.updated_at,p.title as property_title from admin_deals d left join properties p on p.id=d.property_id order by d.updated_at desc limit 100"),
      sql.query<Record<string,unknown>>("select id,name,phone,consultant,status from leads order by created_at desc limit 100"),
      sql.query<Record<string,unknown>>("select id,title,neighborhood from properties where deleted_at is null order by updated_at desc limit 100"),
      sql.query<Record<string,unknown>>("select count(*)::int as total,count(*) filter(where status='negotiation')::int as negotiation,count(*) filter(where status='contracted')::int as contracted,count(*) filter(where status='completed')::int as completed,coalesce(sum(amount) filter(where status not in ('cancelled')),0)::numeric as volume,coalesce(sum(commission) filter(where status in ('contracted','completed')),0)::numeric as commissions from admin_deals")
    ]);
    return {
      deals:deals.map(r=>({id:String(r.id),leadId:r.lead_id?String(r.lead_id):null,propertyId:r.property_id?String(r.property_id):null,title:String(r.title??""),type:validType(r.deal_type),status:validStatus(r.status),customerName:String(r.customer_name??""),customerPhone:String(r.customer_phone??""),consultant:String(r.consultant??""),amount:r.amount==null?null:Number(r.amount),commission:r.commission==null?null:Number(r.commission),contractNumber:String(r.contract_number??""),contractDate:r.contract_date?String(r.contract_date).slice(0,10):null,closingDate:r.closing_date?String(r.closing_date).slice(0,10):null,notes:String(r.notes??""),propertyTitle:r.property_title?String(r.property_title):null,createdAt:new Date(String(r.created_at)).toISOString(),updatedAt:new Date(String(r.updated_at)).toISOString()})),
      leads:leads.map(r=>({id:String(r.id),name:String(r.name??""),phone:String(r.phone??""),consultant:String(r.consultant??""),status:String(r.status??"")})),
      properties:properties.map(r=>({id:String(r.id),title:String(r.title??""),neighborhood:String(r.neighborhood??"")})),
      stats:{total:Number(stats[0]?.total)||0,negotiation:Number(stats[0]?.negotiation)||0,contracted:Number(stats[0]?.contracted)||0,completed:Number(stats[0]?.completed)||0,volume:Number(stats[0]?.volume)||0,commissions:Number(stats[0]?.commissions)||0}
    };
  }
  if(action==="create"){
    const title=clean(body.title,180), customerName=clean(body.customerName,120);
    if(!title||!customerName)throw createError({statusCode:400,statusMessage:"عنوان معامله و نام مشتری الزامی است."});
    const id=crypto.randomUUID();
    await sql.query("insert into admin_deals(id,lead_id,property_id,title,deal_type,status,customer_name,customer_phone,consultant,amount,commission,contract_number,contract_date,closing_date,notes,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)",
      [id,clean(body.leadId,120)||null,clean(body.propertyId,120)||null,title,validType(body.dealType),validStatus(body.status),customerName,clean(body.customerPhone,40),clean(body.consultant,120),money(body.amount),money(body.commission),clean(body.contractNumber,120),clean(body.contractDate,20)||null,clean(body.closingDate,20)||null,clean(body.notes,2000),clean(claims?.displayName,120)||"مدیریت"]);
    return {success:true,id};
  }
  const id=clean(body.id,120); if(!id)throw createError({statusCode:400,statusMessage:"شناسه معامله مشخص نیست."});
  if(action==="status"){await sql.query("update admin_deals set status=$2,updated_at=current_timestamp where id=$1",[id,validStatus(body.status)]);return {success:true};}
  if(action==="delete"){await sql.query("delete from admin_deal_documents where deal_id=$1",[id]);await sql.query("delete from admin_deals where id=$1",[id]);return {success:true};}
  if(action==="seed_documents"){for(const documentType of DEFAULT_DOCUMENTS)await sql.query("insert into admin_deal_documents(id,deal_id,document_type) values($1,$2,$3) on conflict(deal_id,document_type) do nothing",[crypto.randomUUID(),id,documentType]);return {success:true};}
  if(action==="document"){
    const documentType=clean(body.documentType,160); if(!documentType)throw createError({statusCode:400,statusMessage:"نوع مدرک مشخص نیست."});
    const status=["pending","received","verified","rejected"].includes(String(body.documentStatus))?String(body.documentStatus) as DocStatus:"pending";
    await sql.query("insert into admin_deal_documents(id,deal_id,document_type,status,file_url,note,received_at,verified_at) values($1,$2,$3,$4,$5,$6,case when $4 in ('received','verified') then current_timestamp else null end,case when $4='verified' then current_timestamp else null end) on conflict(deal_id,document_type) do update set status=excluded.status,file_url=excluded.file_url,note=excluded.note,received_at=excluded.received_at,verified_at=excluded.verified_at,updated_at=current_timestamp",[crypto.randomUUID(),id,documentType,status,clean(body.fileUrl,1000),clean(body.note,1200)]);
    return {success:true};
  }
  if(action==="documents"){
    const rows=await sql.query<Record<string,unknown>>("select id,document_type,status,file_url,note,received_at,verified_at from admin_deal_documents where deal_id=$1 order by created_at asc",[id]);
    return {documents:rows.map(r=>({id:String(r.id),documentType:String(r.document_type),status:String(r.status) as DocStatus,fileUrl:String(r.file_url??""),note:String(r.note??""),receivedAt:r.received_at?new Date(String(r.received_at)).toISOString():null,verifiedAt:r.verified_at?new Date(String(r.verified_at)).toISOString():null}))};
  }
  throw createError({statusCode:400,statusMessage:"عملیات نامعتبر است."});
});
