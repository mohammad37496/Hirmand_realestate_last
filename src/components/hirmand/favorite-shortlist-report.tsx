import { useMemo, useState } from "react";
import { Check, ClipboardCopy, Link2, Loader2, Printer, Share2, X } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import { toast } from "sonner";
import "@/favorite-shortlist-report.css";

function num(v:string|null|undefined){const n=Number(String(v??"").replace(/[,٬]/g,""));return Number.isFinite(n)&&n>0?n:0}
function price(p:Property){if(p.transactionType==="rent")return [num(p.deposit)?formatToman(num(p.deposit))+" رهن":"",num(p.rent)?formatToman(num(p.rent))+" اجاره":""] .filter(Boolean).join(" + ")||"تماس بگیرید";if(p.transactionType==="mortgage")return num(p.deposit)?formatToman(num(p.deposit))+" رهن":"تماس بگیرید";return num(p.price)?formatToman(num(p.price))+" تومان":"تماس بگیرید"}
export function FavoriteShortlistReport({properties}:{properties:Property[]}){
 const [selected,setSelected]=useState<string[]>(properties.slice(0,4).map(p=>p.slug)); const [open,setOpen]=useState(false); const [shareBusy,setShareBusy]=useState(false); const [shareUrl,setShareUrl]=useState(""); const safe=selected.slice(0,6); const rows=useMemo(()=>safe.map(slug=>properties.find(p=>p.slug===slug)).filter((p):p is Property=>Boolean(p)),[properties,safe]);
 const toggle=(slug:string)=>setSelected(c=>c.includes(slug)?c.filter(x=>x!==slug):c.length>=6?c:[...c,slug]); async function createServerShare(){
   if(!safe.length||shareBusy)return;
   setShareBusy(true);
   try{
     const response=await fetch("/api/shared-shortlist",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({slugs:safe,title:"سبد منتخب هیرمند",expiresDays:14})});
     const payload=await response.json().catch(()=>null) as {shareUrl?:string;expiresAt?:string;statusMessage?:string};
     if(!response.ok||!payload?.shareUrl)throw new Error(payload?.statusMessage||"ساخت لینک اشتراکی انجام نشد.");
     const absolute=new URL(payload.shareUrl,window.location.origin).toString();
     setShareUrl(absolute);
     if(navigator.share){await navigator.share({title:"سبد منتخب هیرمند",text:"سبد منتخب فایل‌های هیرمند",url:absolute});}
     else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(absolute);toast.success("لینک اشتراکی امن کپی شد.");}
     else window.prompt("لینک اشتراکی:",absolute);
   }catch(error){toast.error(error instanceof Error?error.message:"ساخت لینک اشتراکی انجام نشد.");}
   finally{setShareBusy(false);}
 }

 const text=rows.map((p,i)=>[(i+1)+". "+p.title,"محله: "+p.neighborhood,"نوع: "+(p.transactionType==="rent"?"اجاره":p.transactionType==="mortgage"?"رهن":"خرید"),"قیمت: "+price(p),p.areaM2?"متراژ: "+p.areaM2+" متر":"",p.bedrooms!=null?"خواب: "+p.bedrooms:"",p.parking?"پارکینگ: دارد":"پارکینگ: ندارد"].filter(Boolean).join("\n")).join("\n\n");
 return <section className="favorite-shortlist-report"><header><div><span className="kicker">اشتراک انتخاب‌ها</span><h2>گزارش کوتاه سبد منتخب</h2><p>حداکثر ۶ فایل را انتخاب کنید و یک خلاصه مناسب برای ارسال به خانواده، شریک یا مشاور بسازید.</p></div><button type="button" className="btn-gold" onClick={()=>setOpen(true)} disabled={!safe.length}><Share2 size={15}/> ساخت گزارش</button></header>
 <div className="favorite-shortlist-select">{properties.map(p=><label key={p.id}><input type="checkbox" checked={selected.includes(p.slug)} onChange={()=>toggle(p.slug)}/><span>{p.title}</span></label>)}</div>
 {open?<div className="favorite-shortlist-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)setOpen(false)}}><section className="favorite-shortlist-modal"><button className="favorite-shortlist-close" type="button" onClick={()=>setOpen(false)}><X size={18}/></button><div className="favorite-shortlist-modal-head"><div><span className="kicker">گزارش قابل ارسال</span><h3>سبد منتخب من در هیرمند</h3></div><div><button type="button" className="btn-ghost" onClick={()=>window.print()}><Printer size={14}/> چاپ</button><button type="button" className="btn-ghost" onClick={()=>navigator.clipboard?.writeText(text)}><ClipboardCopy size={14}/> کپی متن</button><button type="button" className="btn-gold" onClick={()=>void createServerShare()} disabled={shareBusy}>{shareBusy?<Loader2 size={14} className="admin-spin"/>:<Link2 size={14}/>} لینک اشتراکی</button></div></div><div className="favorite-shortlist-report-grid">{rows.map(p=><article key={p.id}><strong>{p.title}</strong><span>{p.neighborhood}</span><b>{price(p)}</b><small>{p.areaM2?p.areaM2.toLocaleString("fa-IR")+" متر":"متراژ ثبت نشده"}{p.bedrooms!=null?" · "+p.bedrooms+" خواب":""}</small></article>)}</div><div className="favorite-shortlist-report-note"><Check size={14}/> این گزارش خلاصه اطلاعات آگهی است و جایگزین بررسی حضوری و مدارک نیست.</div>{shareUrl?<div className="favorite-shortlist-share-url"><Link2 size={14}/><a href={shareUrl}>{shareUrl}</a><small>این لینک تا ۱۴ روز معتبر است و فقط فایل‌های منتشرشده را نشان می‌دهد.</small></div>:null}</section></div>:null}
 </section>
}