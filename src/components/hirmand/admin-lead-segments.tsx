import { useEffect, useState } from "react";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

type Segment={id:string;title:string;query:string;status:string;sort:string;matchCount:number};
type Props={query:string;status:string;sort:string;onApply:(value:{query:string;status:string;sort:string})=>void};

export function AdminLeadSegments({query,status,sort,onApply}:Props){
 const [items,setItems]=useState<Segment[]>([]),[title,setTitle]=useState(""),[loading,setLoading]=useState(true);
 async function load(){setLoading(true);try{const r=await fetch("/api/admin-lead-segments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"list"})});const x=await r.json();if(!r.ok)throw new Error(x?.statusMessage||"لیست‌های هوشمند دریافت نشد.");setItems(x.segments||[]);}catch(e){toast.error(e instanceof Error?e.message:"لیست‌ها دریافت نشد.");}finally{setLoading(false);}}
 useEffect(()=>{void load();},[]);
 async function save(){if(!title.trim())return toast.error("نام لیست را وارد کنید.");const r=await fetch("/api/admin-lead-segments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"save",title,query,status,sort})});const x=await r.json();if(!r.ok)return toast.error(x?.statusMessage||"ذخیره نشد.");setTitle("");toast.success("لیست هوشمند ذخیره شد.");await load();}
 async function remove(id:string){if(!window.confirm("این لیست هوشمند حذف شود؟"))return;const r=await fetch("/api/admin-lead-segments",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"delete",id})});if(r.ok){toast.success("لیست حذف شد.");await load();}}
 return <section className="admin-panel admin-lead-segments" dir="rtl"><div className="admin-panel-head"><div><span className="kicker">CRM</span><h2><Bookmark size={18}/> لیست‌های هوشمند مشتریان</h2><p>فیلتر فعلی CRM را با یک نام ذخیره کنید تا بعداً با یک کلیک دوباره همان مشتریان را ببینید.</p></div></div>
 <div className="admin-segment-create"><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثلاً لیدهای داغ رهن اصفهان"/><button className="btn-gold" type="button" onClick={()=>void save()}><Plus size={15}/> ذخیره فیلتر فعلی</button></div>
 <div className="admin-segment-list">{loading?<div className="admin-empty">در حال دریافت…</div>:items.map(item=><article key={item.id}><button type="button" className="admin-segment-apply" onClick={()=>onApply({query:item.query,status:item.status,sort:item.sort})}><strong>{item.title}</strong><small>{item.matchCount.toLocaleString("fa-IR")} مشتری · {item.status==="all"?"همه وضعیت‌ها":item.status} · {item.query||"بدون جستجو"}</small></button><button className="admin-icon-btn danger" type="button" onClick={()=>void remove(item.id)} title="حذف"><Trash2 size={14}/></button></article>)}</div>
 </section>;
}
