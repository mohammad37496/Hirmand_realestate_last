import { useMemo } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, FileWarning, MapPin, Scale, ShieldAlert } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-risk-radar.css";

type Risk={title:string;detail:string;icon:"legal"|"money"|"date"|"map"|"data";level:"بررسی مهم"|"نیازمند بررسی"|"اطلاعاتی"};
function read<T>(key:string):T|null{try{return JSON.parse(localStorage.getItem(key)||"null") as T|null}catch{return null}}
export function PropertyRiskRadar({property}:{property:Property}){
 const risks=useMemo<Risk[]>(()=>{const r:Risk[]=[];
  if((property.transactionType==="buy"||property.transactionType==="sell")&&!property.price)r.push({title:"قیمت عددی ثبت نشده",detail:"برای تحلیل مالی، مبلغ قابل محاسبه در آگهی موجود نیست.",icon:"money",level:"بررسی مهم"});
  if(!property.areaM2)r.push({title:"متراژ ثبت نشده",detail:"تطبیق متراژ آگهی با مدارک یا وضعیت واقعی نیاز به بررسی دارد.",icon:"data",level:"نیازمند بررسی"});
  if(property.updatedAt){const days=Math.floor((Date.now()-new Date(property.updatedAt).getTime())/86400000);if(Number.isFinite(days)&&days>120)r.push({title:"به‌روزرسانی قدیمی",detail:"بیش از ۱۲۰ روز از آخرین به‌روزرسانی ثبت‌شده گذشته است.",icon:"date",level:"نیازمند بررسی"})}else r.push({title:"تاریخ به‌روزرسانی موجود نیست",detail:"سن اطلاعات فایل از داده فعلی قابل تشخیص نیست.",icon:"date",level:"اطلاعاتی"});
  if(property.latitude==null||property.longitude==null)r.push({title:"موقعیت دقیق ثبت نشده",detail:"برای تطبیق دقیق موقعیت، اطلاعات مکانی کامل نیست.",icon:"map",level:"اطلاعاتی"});
  const q=read<any[]>("hirmand-property-question-log-v1:"+property.id);if(Array.isArray(q)){const u=q.filter(x=>x&&!String(x.answer||"").trim()).length;if(u)r.push({title:"سؤال بدون پاسخ",detail:u.toLocaleString("fa-IR")+" سؤال در دفتر پرسش‌ها هنوز پاسخ ندارد.",icon:"legal",level:"بررسی مهم"})}
  const d=read<any>("hirmand-property-deal-room-v1:"+property.id);if(Array.isArray(d?.items)){const u=d.items.filter((x:any)=>x&&x.required&&x.status!=="تکمیل").length;if(u)r.push({title:"موارد ضروری معامله باز است",detail:u.toLocaleString("fa-IR")+" مورد ضروری در اتاق معامله تکمیل نشده.",icon:"legal",level:"بررسی مهم"})}
  if(property.availabilityStatus!=="available")r.push({title:"وضعیت فایل نیازمند بررسی مجدد است",detail:"وضعیت فعلی آگهی: "+String(property.availabilityStatus),icon:"data",level:"نیازمند بررسی"});
  return r},[property]);
 const icon=(x:Risk["icon"])=>x==="legal"?<Scale size={16}/>:x==="money"?<FileWarning size={16}/>:x==="date"?<CalendarClock size={16}/>:x==="map"?<MapPin size={16}/>:<AlertTriangle size={16}/>;
 const counts={a:risks.filter(x=>x.level==="بررسی مهم").length,b:risks.filter(x=>x.level==="نیازمند بررسی").length,c:risks.filter(x=>x.level==="اطلاعاتی").length};
 return <section className="property-risk-radar"><header><div><span className="kicker">کنترل پیش از تصمیم</span><h2><ShieldAlert size={20}/> رادار موارد نیازمند بررسی</h2><p>این بخش حکم حقوقی یا کارشناسی نیست؛ فقط از داده‌های فایل و یادداشت‌های شخصی شما، مواردی برای بررسی دوباره استخراج می‌کند.</p></div><div className="property-risk-counts"><span>{counts.a.toLocaleString("fa-IR")} مهم</span><span>{counts.b.toLocaleString("fa-IR")} قابل بررسی</span><span>{counts.c.toLocaleString("fa-IR")} اطلاعاتی</span></div></header>
  {risks.length?<div className="property-risk-list">{risks.map((x,i)=><article key={x.title+i}><span>{icon(x.icon)}</span><div><strong>{x.title}</strong><small>{x.detail}</small></div><b>{x.level}</b></article>)}</div>:<div className="property-risk-clear"><CheckCircle2 size={18}/> مورد مشخصی برای بررسی مضاعف از داده‌های فعلی پیدا نشد.</div>}
 </section>;
}
