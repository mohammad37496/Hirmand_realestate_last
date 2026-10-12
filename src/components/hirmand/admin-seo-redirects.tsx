import { useEffect, useState } from "react";
import { ExternalLink, Link as LinkIcon, Plus, RefreshCw, Route, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  clearAdmin404Logs,
  deleteAdminRedirect,
  listAdmin404Logs,
  listAdminRedirects,
  upsertAdminRedirect,
  type RedirectRow,
} from "@/lib/seo-redirects";

type NotFoundRow={id:number;path:string;hitCount:number;referrer:string;userAgent:string;firstSeenAt:string;lastSeenAt:string};

function fa(value:number){return value.toLocaleString("fa-IR")}
function date(value:string|null){return value?new Date(value).toLocaleString("fa-IR",{dateStyle:"medium",timeStyle:"short"}):"—"}

export function AdminSeoRedirects() {
  const [redirects,setRedirects]=useState<RedirectRow[]>([]);
  const [notFound,setNotFound]=useState<NotFoundRow[]>([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [deleting,setDeleting]=useState<number|null>(null);
  const [source,setSource]=useState("");
  const [target,setTarget]=useState("");
  const [statusCode,setStatusCode]=useState<301|302|307|308>(301);
  const [active,setActive]=useState(true);
  const [editingId,setEditingId]=useState<number|undefined>();

  async function load(){
    setLoading(true);
    try{
      const [items,errors]=await Promise.all([
        listAdminRedirects({data:{limit:100}}),
        listAdmin404Logs({data:{limit:100}}),
      ]);
      setRedirects(items);
      setNotFound(errors);
    }catch(error){toast.error(error instanceof Error?error.message:"گزارش SEO دریافت نشد.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  function reset(){
    setEditingId(undefined);setSource("");setTarget("");setStatusCode(301);setActive(true);
  }
  function draftFrom404(path:string){
    setEditingId(undefined);setSource(path);setTarget("/");setStatusCode(301);setActive(true);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  async function save(){
    setSaving(true);
    try{
      const item=await upsertAdminRedirect({data:{id:editingId,sourcePath:source,targetPath:target,statusCode,active}});
      setRedirects((current)=>{
        const rest=current.filter((row)=>row.id!==item.id&&row.sourcePath!==item.sourcePath);
        return [item,...rest];
      });
      toast.success(editingId?"ریدایرکت به‌روزرسانی شد.":"ریدایرکت ثبت شد.");
      reset();
    }catch(error){toast.error(error instanceof Error?error.message:"ذخیره ریدایرکت انجام نشد.");}
    finally{setSaving(false);}
  }

  async function remove(id:number){
    setDeleting(id);
    try{
      await deleteAdminRedirect({data:{id}});
      setRedirects((current)=>current.filter((item)=>item.id!==id));
      toast.success("ریدایرکت حذف شد.");
    }catch(error){toast.error(error instanceof Error?error.message:"حذف ریدایرکت انجام نشد.");}
    finally{setDeleting(null);}
  }

  async function clearErrors(){
    try{
      const result=await clearAdmin404Logs({data:{beforeDays:30}});
      toast.success(`${fa(result.deleted)} رکورد ۴۰۴ قدیمی پاک شد.`);
      await load();
    }catch(error){toast.error(error instanceof Error?error.message:"پاک‌سازی گزارش ۴۰۴ انجام نشد.");}
  }

  return (
    <main className="admin-seo-redirects">
      <section className="admin-panel admin-seo-hero">
        <div className="admin-seo-hero-icon"><Route size={28}/></div>
        <div><span className="kicker">SEO فنی</span><h2>مدیریت ریدایرکت و خطاهای ۴۰۴</h2><p>مسیرهای قدیمی فایل‌ها یا صفحات را بدون دست‌زدن به کد به مقصد صحیح هدایت کنید و صفحاتی که کاربران به آن‌ها می‌رسند ولی وجود ندارند را پیدا کنید.</p></div>
        <button type="button" className="btn-ghost" onClick={()=>void load()} disabled={loading}><RefreshCw size={15} className={loading?"admin-spin":""}/> تازه‌سازی</button>
      </section>

      <section className="admin-seo-grid">
        <div className="admin-panel admin-seo-form">
          <div className="admin-panel-head"><div><span className="kicker">مدیر مسیرها</span><h2>{editingId?"ویرایش ریدایرکت":"ساخت ریدایرکت جدید"}</h2></div><LinkIcon size={19}/></div>
          <label className="admin-seo-field"><span>مسیر قدیمی</span><input dir="ltr" value={source} onChange={e=>setSource(e.target.value)} placeholder="/old-property-slug"/></label>
          <label className="admin-seo-field"><span>مقصد جدید</span><input dir="ltr" value={target} onChange={e=>setTarget(e.target.value)} placeholder="/properties/new-slug یا https://..." /></label>
          <div className="admin-seo-row">
            <label className="admin-seo-field"><span>کد انتقال</span><select value={statusCode} onChange={e=>setStatusCode(Number(e.target.value) as typeof statusCode)}><option value="301">301 · دائمی</option><option value="302">302 · موقت</option><option value="307">307 · موقت با روش درخواست</option><option value="308">308 · دائمی با روش درخواست</option></select></label>
            <label className="admin-seo-toggle"><input type="checkbox" checked={active} onChange={e=>setActive(e.target.checked)}/><span><strong>فعال</strong><small>از همین لحظه اعمال شود</small></span></label>
          </div>
          <div className="admin-seo-form-actions"><button type="button" className="btn-ghost" onClick={reset} disabled={saving}>پاک کردن</button><button type="button" className="btn-gold" onClick={()=>void save()} disabled={saving||!source.trim()||!target.trim()}><Plus size={15}/>{saving?"در حال ذخیره…":editingId?"ذخیره تغییرات":"ثبت ریدایرکت"}</button></div>
        </div>

        <section className="admin-panel admin-seo-404">
          <div className="admin-panel-head"><div><span className="kicker">گزارش ۴۰۴</span><h2>مسیرهای خراب پرتکرار</h2></div><button type="button" className="btn-ghost" onClick={()=>void clearErrors()} disabled={loading||!notFound.length}>پاک‌سازی ۳۰ روزه</button></div>
          {loading?<div className="admin-seo-empty">در حال بررسی…</div>:!notFound.length?<div className="admin-seo-empty"><AlertTriangle size={18}/> خطای ثبت‌شده‌ای نداریم.</div>:<div className="admin-seo-404-list">{notFound.slice(0,20).map(item=><button key={item.id} type="button" className="admin-seo-404-row" onClick={()=>draftFrom404(item.path)}><span><strong dir="ltr">{item.path}</strong><small>{fa(item.hitCount)} بازدید ۴۰۴ · آخرین بار {date(item.lastSeenAt)}</small></span><Plus size={15}/></button>)}</div>}
        </section>
      </section>

      <section className="admin-panel admin-seo-table">
        <div className="admin-panel-head"><div><span className="kicker">مسیرهای فعال</span><h2>ریدایرکت‌های ثبت‌شده</h2></div><span className="admin-dashboard-summary">{fa(redirects.length)} مورد</span></div>
        {loading?<div className="admin-seo-empty">در حال دریافت…</div>:!redirects.length?<div className="admin-seo-empty">هنوز ریدایرکتی ثبت نشده است.</div>:<div className="admin-seo-table-list">{redirects.map(item=><article key={item.id} className="admin-seo-table-row"><div className="admin-seo-route"><strong dir="ltr">{item.sourcePath}</strong><span>→</span><strong dir="ltr">{item.targetPath}</strong></div><div className="admin-seo-meta"><span>{item.statusCode}</span><span>{item.active?"فعال":"خاموش"}</span><span>{fa(item.hitCount)} کلیک</span><span>آخرین بازدید: {date(item.lastHitAt)}</span></div><div className="admin-seo-actions"><a className="admin-icon-btn" href={item.targetPath} target="_blank" rel="noreferrer" title="باز کردن مقصد"><ExternalLink size={15}/></a><button type="button" className="admin-icon-btn" onClick={()=>{setEditingId(item.id);setSource(item.sourcePath);setTarget(item.targetPath);setStatusCode(item.statusCode);setActive(item.active);window.scrollTo({top:0,behavior:"smooth"});}} title="ویرایش"><LinkIcon size={15}/></button><button type="button" className="admin-icon-btn danger" disabled={deleting===item.id} onClick={()=>void remove(item.id)} title="حذف"><Trash2 size={15}/></button></div></article>)}</div>}
      </section>
    </main>
  );
}
