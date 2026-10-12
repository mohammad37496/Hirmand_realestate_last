import { ArrowLeft,AlertCircle,CalendarClock,WalletCards,Sparkles } from "lucide-react";
import { useEffect,useState } from "react";
import { formatToman } from "@/lib/money";

type DueLead={id:string;name:string;phone:string;deal:string;neighborhood:string;status:string;followUpAt:string|null};
type Ops={dueCount:number;dueLeads:DueLead[];next7Count:number;staleProperties:number;finance:{income:number;expense:number;balance:number}};

export function AdminOperationsCenter({
  onOpenLeads,
  onOpenMatching,
  onOpenProperties,
  onOpenFinance,
  showFinance = true,
}:{
  onOpenLeads:()=>void;
  onOpenMatching:()=>void;
  onOpenProperties:()=>void;
  onOpenFinance:()=>void;
  showFinance?: boolean;
}){
 const [data,setData]=useState<Ops|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 async function load(){
  setLoading(true);setError("");
  try{
   const res=await fetch("/api/admin-operations",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({})});
   const json=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(json?.statusMessage||"مرکز عملیات بارگذاری نشد.");
   setData(json as Ops);
  }catch(e){setError(e instanceof Error?e.message:"مرکز عملیات بارگذاری نشد.");}
  finally{setLoading(false);}
 }
 useEffect(()=>{void load();const t=window.setInterval(()=>void load(),60000);return()=>window.clearInterval(t)},[]);
 if(loading&&!data)return <section className="admin-panel admin-ops-center"><div className="admin-matching-empty">در حال آماده‌سازی مرکز عملیات…</div></section>;
 return <section className="admin-panel admin-ops-center">
  <div className="admin-panel-head">
   <div><span className="kicker">مرکز عملیات</span><h2>کارهای مهم امروز</h2></div>
   <button className="btn-ghost" type="button" onClick={()=>void load()}>به‌روزرسانی</button>
  </div>
  {error?<div className="admin-matching-error">{error}</div>:null}
  {data?<><div className="admin-ops-summary">
   <button type="button" onClick={onOpenLeads} data-tone={data.dueCount?"red":"green"}><AlertCircle size={18}/><span><small>پیگیری سررسیدشده</small><strong>{data.dueCount.toLocaleString("fa-IR")}</strong></span><ArrowLeft size={14}/></button>
   <button type="button" onClick={onOpenLeads}><CalendarClock size={18}/><span><small>پیگیری ۷ روز آینده</small><strong>{data.next7Count.toLocaleString("fa-IR")}</strong></span><ArrowLeft size={14}/></button>
   <button type="button" onClick={onOpenProperties} data-tone={data.staleProperties?"amber":"green"}><Sparkles size={18}/><span><small>فایل قدیمی‌تر از ۳۰ روز</small><strong>{data.staleProperties.toLocaleString("fa-IR")}</strong></span><ArrowLeft size={14}/></button>
   {showFinance ? <button type="button" onClick={onOpenFinance}><WalletCards size={18}/><span><small>مانده دفتر</small><strong>{formatToman(Math.abs(data.finance.balance))}{data.finance.balance<0?" · بدهکار":""}</strong></span><ArrowLeft size={14}/></button> : null}
  </div>
  <div className="admin-ops-grid">
   <div><div className="admin-ops-section-title"><strong>اقدامات فوری</strong><button className="text-link" type="button" onClick={onOpenLeads}>مشاهده همه</button></div>
    {data.dueLeads.length?<div className="admin-ops-leads">{data.dueLeads.map(lead=><button key={lead.id} type="button" onClick={onOpenLeads}><span className="admin-ops-dot"></span><span><strong>{lead.name}</strong><small>{lead.deal}{lead.neighborhood?" · "+lead.neighborhood:""} · {lead.followUpAt?new Date(lead.followUpAt).toLocaleString("fa-IR",{dateStyle:"short",timeStyle:"short"}):"بدون زمان"}</small></span><ArrowLeft size={13}/></button>)}</div>:<div className="admin-ops-empty">امروز پیگیری عقب‌افتاده‌ای نداری.</div>}
   </div>
   <div><div className="admin-ops-section-title"><strong>میانبر</strong><span></span></div>
    <div className="admin-ops-shortcuts">
      <button type="button" onClick={onOpenMatching}><strong>مچ کردن</strong><small>درخواست‌های جدید را با فایل‌ها پیدا کن</small></button>
      <button type="button" onClick={onOpenLeads}><strong>CRM</strong><small>وضعیت و زمان پیگیری مشتریان</small></button>
      <button type="button" onClick={onOpenProperties}><strong>فایل‌های قدیمی</strong><small>فایل‌های منتشرشده را برای به‌روزرسانی بررسی کن</small></button>
      {showFinance ? <button type="button" onClick={onOpenFinance}><strong>حسابداری</strong><small>درآمد، هزینه و مانده دفتر</small></button> : null}
    </div>
   </div>
  </div></>:null}
 </section>
}
