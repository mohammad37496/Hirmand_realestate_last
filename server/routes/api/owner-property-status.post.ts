import { createError, defineEventHandler, readBody, setResponseHeader } from "h3";
import { z } from "zod";
import { dbSource, getSql } from "@/lib/db";
import { assertSameOrigin, clientFingerprint, consumeAdminAttempt } from "@/lib/admin-rate-limit.server";

const schema=z.object({trackingToken:z.string().trim().toUpperCase().regex(/^HIR-[A-Z0-9]{2}-[A-F0-9]{12}$/)});
const STATUS_LABELS:Record<string,string>={pending:"در انتظار بررسی کارشناسی",approved:"تأیید شده و وارد مسیر انتشار",rejected:"نیازمند اصلاح اطلاعات"};
const EVENT_LABELS:Record<string,string>={created:"ثبت ملک دریافت شد",assign:"پرونده به مشاور اختصاص یافت",approve:"ملک تأیید و برای انتشار آماده شد",reject:"کارشناس درخواست اصلاح را ثبت کرد",resubmit:"نسخه اصلاح‌شده دوباره ارسال شد"};

export default defineEventHandler(async(event)=>{
 setResponseHeader(event,"cache-control","no-store");
 if(dbSource==="unconfigured")return {success:false,statusMessage:"سامانه ثبت ملک آنلاین فعال نیست."};
 assertSameOrigin(event);
 const throttle=await consumeAdminAttempt("owner-status:"+clientFingerprint(event));
 if(!throttle.allowed)throw createError({statusCode:429,statusMessage:"تعداد درخواست‌های پیگیری بیش از حد مجاز است. چند دقیقه دیگر دوباره تلاش کنید."});
 const body=await readBody(event).catch(()=>({}));
 const parsed=schema.safeParse(body);
 if(!parsed.success)throw createError({statusCode:422,statusMessage:"کد رهگیری ثبت ملک معتبر نیست."});
 const sql=await getSql();
 const rows=await sql.query<Record<string,unknown>>("select s.id,s.public_tracking_token,s.status,s.review_note,s.created_at,s.reviewed_at,s.updated_at,s.assigned_consultant_name,s.property_id,p.title as property_title,p.slug as property_slug from customer_property_submissions s left join properties p on p.id=s.property_id and p.status='published' where s.public_tracking_token=$1 limit 1",[parsed.data.trackingToken]);
 const submission=rows[0];
 if(!submission)throw createError({statusCode:404,statusMessage:"پرونده‌ای با این کد پیدا نشد."});
 const eventRows=await sql.query<Record<string,unknown>>("select action,note,created_at from customer_property_submission_events where submission_id=$1 and action = any($2::text[]) order by created_at asc limit 20",[submission.id,["created","assign","approve","reject","resubmit"]]);
 const status=String(submission.status??"pending");
 const property=submission.property_id&&submission.property_slug&&submission.property_title?{title:String(submission.property_title),slug:String(submission.property_slug)}:null;
 return {success:true,trackingToken:String(submission.public_tracking_token),status,statusLabel:STATUS_LABELS[status]||"در حال بررسی",reviewNote:status==="rejected"?String(submission.review_note??""):"",createdAt:new Date(String(submission.created_at)).toISOString(),updatedAt:new Date(String(submission.updated_at??submission.created_at)).toISOString(),reviewedAt:submission.reviewed_at?new Date(String(submission.reviewed_at)).toISOString():null,consultant:String(submission.assigned_consultant_name??""),property,timeline:eventRows.map(row=>({type:String(row.action??""),label:EVENT_LABELS[String(row.action??"")]||"بروزرسانی پرونده",note:String(row.note??""),at:new Date(String(row.created_at)).toISOString()}))};
});
