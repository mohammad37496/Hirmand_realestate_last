import { useEffect, useMemo, useState } from "react";
import { Building2, Phone, Search, UserRound } from "lucide-react";
import { propertyPath } from "@/lib/property-path";
import { formatToman } from "@/lib/money";

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
  const [expanded,setExpanded]=useState<string|null>(null);
  const [error,setError]=useState("");

  async function load(){
    setLoading(true); setError("");
    try{
      const response=await fetch("/api/admin-owners",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"list",query})});
      const data=await response.json().catch(()=>({}));
      if(!response.ok) throw new Error(data?.statusMessage||data?.message||"بارگذاری مالکین انجام نشد.");
      setOwners(Array.isArray(data.owners)?data.owners:[]);
    }catch(e){setError(e instanceof Error?e.message:"بارگذاری مالکین انجام نشد.");}
    finally{setLoading(false);}
  }

  useEffect(()=>{const t=window.setTimeout(()=>void load(),250);return()=>window.clearTimeout(t)},[query]);

  const totalFiles=useMemo(()=>owners.reduce((n,o)=>n+o.fileCount,0),[owners]);

  return <div className="admin-owner-manager">
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div><span className="kicker">مالکین</span><h2>{owners.length.toLocaleString("fa-IR")} مالک · {totalFiles.toLocaleString("fa-IR")} فایل</h2></div>
        <button type="button" className="btn-ghost" onClick={()=>void load()} disabled={loading}>به‌روزرسانی</button>
      </div>
      <label className="admin-search" style={{marginBottom:12}}>
        <Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="جستجوی نام یا تلفن مالک..." />
      </label>
      {error?<div className="admin-matching-error">{error}</div>:null}
      {loading?<div className="admin-matching-empty">در حال دریافت مالکین…</div>:
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
