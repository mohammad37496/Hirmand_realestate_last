import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Phone, Search, UserRound } from "lucide-react";
import { propertyPath } from "@/lib/property-path";
import { formatToman } from "@/lib/money";
import { AdminErrorBanner } from "@/components/hirmand/admin-ui";

type OwnerFile = {
  id:string; slug:string; title:string; status:string; transactionType:string;
  price:string|null; deposit:string|null; rent:string|null;
};
type Owner = {
  name:string; phone:string; fileCount:number; publishedCount:number;
  lastUpdated:string|null; files:OwnerFile[];
};

const TX: Record<string,string> = {
  buy:"خرید", sell:"فروش", rent:"اجاره", mortgage:"رهن"
};

export function AdminOwnerManager(){
  const [owners,setOwners]=useState<Owner[]>([]);
  const [query,setQuery]=useState("");
  const [loading,setLoading]=useState(true);
  const [available,setAvailable]=useState<boolean|null>(null);
  const [expanded,setExpanded]=useState<string|null>(null);
  const [error,setError]=useState("");
  const requestSequence=useRef(0);

  const load=useCallback(async()=>{
    const requestId=++requestSequence.current;
    setLoading(true); setError("");
    try{
      const response=await fetch("/api/admin-owners",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"list",query})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data?.statusMessage||data?.message||"بارگذاری مالکین انجام نشد.");
      if(typeof data.available!=="boolean"||!Array.isArray(data.owners)) throw new Error("ساختار پاسخ مالکین معتبر نیست.");
      if(requestId!==requestSequence.current)return;
      setAvailable(data.available);
      setOwners(data.available?data.owners:[]);
      if(!data.available) setError("اطلاعات مالکین در دسترس نیست؛ پایگاه داده پیکربندی نشده است.");
    }catch(e){if(requestId===requestSequence.current){setAvailable(null);setOwners([]);setError(e instanceof Error?e.message:"بارگذاری مالکین انجام نشد.");}}
    finally{if(requestId===requestSequence.current)setLoading(false);}
  },[query]);

  useEffect(()=>{const t=window.setTimeout(()=>void load(),250);return()=>{window.clearTimeout(t);requestSequence.current+=1;}},[load]);

  const totalFiles=useMemo(()=>owners.reduce((n,o)=>n+o.fileCount,0),[owners]);

  return <div className="admin-owner-manager">
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div><span className="kicker">مالکین</span><h2>{available===true&&!error?owners.length.toLocaleString("fa-IR")+" مالک · "+totalFiles.toLocaleString("fa-IR")+" فایل":"اطلاعات مالکین در دسترس نیست"}</h2></div>
        <button type="button" className="btn-ghost" onClick={()=>void load()} disabled={loading}>به‌روزرسانی</button>
      </div>
      <label className="admin-search" style={{marginBottom:12}}>
        <Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جستجوی نام یا تلفن مالک..." disabled={available!==true||!!error} />
      </label>
      {error?<AdminErrorBanner message={error} onRetry={()=>void load()}/>:available===false?<AdminErrorBanner message="اطلاعات مالکین در دسترس نیست." onRetry={()=>void load()}/>:null}
      {error||available===false?null:loading?<div className="admin-matching-empty">در حال دریافت مالکین…</div>:available!==true?<div className="admin-matching-empty">در حال دریافت مالکین…</div>:
       owners.length===0?<div className="admin-empty"><UserRound size={28}/><strong>مالک ثبت‌شده‌ای پیدا نشد</strong><p>اطلاعات مالک از فایل‌های ثبت‌شده جمع‌آوری می‌شود.</p></div>:
       <div className="admin-owner-grid">
        {owners.map(owner=>{
          const key=owner.name+"::"+owner.phone;
          const open=expanded===key;
          return <article key={key} className="admin-owner-card">
            <div className="admin-owner-top">
              <span className="admin-owner-avatar"><UserRound size={18}/></span>
              <div className="admin-owner-title"><strong>{owner.name}</strong><small>{owner.fileCount.toLocaleString("fa-IR")} فایل · {owner.publishedCount.toLocaleString("fa-IR")} منتشرشده</small></div>
              {owner.phone?<a className="admin-owner-phone" href={"tel:"+owner.phone}><Phone size={14}/>{owner.phone}</a>:null}
            </div>
            <div className="admin-owner-stats">
              <div><small>کل فایل</small><strong>{owner.fileCount.toLocaleString("fa-IR")}</strong></div>
              <div><small>منتشرشده</small><strong>{owner.publishedCount.toLocaleString("fa-IR")}</strong></div>
              <div><small>آخرین ویرایش</small><strong>{owner.lastUpdated?new Date(owner.lastUpdated).toLocaleDateString("fa-IR"):"—"}</strong></div>
            </div>
            <button type="button" className="btn-ghost" onClick={()=>setExpanded(open?null:key)}>{open?"بستن فایل‌ها":"مشاهده همه فایل‌ها"}</button>
            {open?<div className="admin-owner-files">
              {owner.files.map(file=><div key={file.id} className="admin-owner-file">
                <div><strong>{file.title}</strong><small>{TX[file.transactionType]??file.transactionType}</small></div>
                <span>{file.price?formatToman(Number(file.price)):file.deposit?formatToman(Number(file.deposit)):file.rent?formatToman(Number(file.rent)):"—"}</span>
                <a href={propertyPath(file)} target="_blank" rel="noreferrer">مشاهده</a>
              </div>)}
            </div>:null}
          </article>
        })}
       </div>}
    </section>
  </div>
}
