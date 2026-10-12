import { useEffect, useMemo, useState } from "react";
import { BellRing, ClipboardCheck, ClipboardPenLine, CircleDollarSign, ListChecks } from "lucide-react";
import { Link } from "@tanstack/react-router";
import type { Property } from "@/lib/properties";
import { propertyPath } from "@/lib/property-path";
import "@/favorite-action-center.css";

type Task={id:string;slug:string;title:string;detail:string;kind:string};
function read(key:string){try{return JSON.parse(localStorage.getItem(key)||"null")}catch{return null}}
export function FavoriteActionCenter({properties}:{properties:Property[]}){
 const [tick,setTick]=useState(0);
 useEffect(()=>{const t=window.setInterval(()=>setTick(v=>v+1),1500);return()=>window.clearInterval(t)},[]);
 const tasks=useMemo<Task[]>(()=>{const out:Task[]=[];for(const p of properties){
  const r=read("hirmand-property-reminder-v1:"+p.id);if(r?.date&&!r?.done)out.push({id:p.id+"r",slug:p.slug,title:"یادآور پیگیری",detail:(r.action||"پیگیری")+" · "+r.date,kind:"reminder"});
  const d=read("hirmand-property-deal-room-v1:"+p.id);const open=Array.isArray(d?.items)?d.items.filter((x:any)=>x&&x.status!=="تکمیل").length:0;if(open)out.push({id:p.id+"d",slug:p.slug,title:"موارد باز اتاق معامله",detail:open.toLocaleString("fa-IR")+" مورد باز",kind:"deal"});
  const q=read("hirmand-property-question-log-v1:"+p.id);const unanswered=Array.isArray(q)?q.filter((x:any)=>x&&!String(x.answer||"").trim()).length:0;if(unanswered)out.push({id:p.id+"q",slug:p.slug,title:"سؤال‌های بدون پاسخ",detail:unanswered.toLocaleString("fa-IR")+" سؤال",kind:"question"});
  const n=read("hirmand-property-negotiation-log-v1:"+p.id);if(Array.isArray(n)&&n.length)out.push({id:p.id+"n",slug:p.slug,title:"ادامه پیگیری مذاکره",detail:n.length.toLocaleString("fa-IR")+" سابقه ثبت شده",kind:"negotiation"});
 }return out},[properties,tick]);
 if(!tasks.length)return null;
 const counts={reminder:tasks.filter(x=>x.kind==="reminder").length,deal:tasks.filter(x=>x.kind==="deal").length,question:tasks.filter(x=>x.kind==="question").length};
 return <section className="favorite-action-center"><header><div><span className="kicker">مرکز اقدام</span><h2><ListChecks size={19}/> کارهای باز فایل‌های منتخب</h2><p>یادآورها، موارد باز معامله، سؤال‌های بدون پاسخ و پیگیری مذاکره یک‌جا.</p></div><div className="favorite-action-center-stats"><span><BellRing size={12}/>{counts.reminder.toLocaleString("fa-IR")}</span><span><ClipboardCheck size={12}/>{counts.deal.toLocaleString("fa-IR")}</span><span><ClipboardPenLine size={12}/>{counts.question.toLocaleString("fa-IR")}</span></div></header>
  <div className="favorite-action-center-list">{tasks.slice(0,12).map(t=>{const p=properties.find(x=>x.slug===t.slug);if(!p)return null;return <article key={t.id}><span className="favorite-action-center-icon">{t.kind==="reminder"?<BellRing size={15}/>:t.kind==="question"?<ClipboardPenLine size={15}/>:t.kind==="negotiation"?<CircleDollarSign size={15}/>:<ClipboardCheck size={15}/>}</span><div><strong>{t.title}</strong><small>{t.detail}</small><small>{p.title}</small></div><Link to={propertyPath(p) as any}>مشاهده فایل</Link></article>})}</div></section>
}