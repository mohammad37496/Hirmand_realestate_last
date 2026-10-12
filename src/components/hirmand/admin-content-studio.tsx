import { useEffect, useMemo, useState } from "react";
import { BookOpen, Check, ChevronDown, FileText, Plus, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  deleteAdminSiteContent,
  listAdminSiteContent,
  upsertAdminSiteContent,
} from "@/lib/site-content";
// Types come from the client-safe module: importing them from
// `@/lib/site-content` would pull the database into the browser bundle.
import type { FaqContent, GuideContent } from "@/lib/site-content-static";

type Kind="guide"|"faq";
type Draft={id:string;kind:Kind;category:string;title:string;summary:string;answer:string;points:string[];sortOrder:number;active:boolean};

const blank=(kind:Kind):Draft=>({id:"",kind,category:kind==="guide"?"خرید":"عمومی",title:"",summary:"",answer:"",points:[""],sortOrder:0,active:true});
const guideDraft=(x:GuideContent):Draft=>({id:x.id,kind:"guide",category:x.category,title:x.title,summary:x.summary,answer:"",points:x.points.length?x.points:[""],sortOrder:x.sortOrder,active:x.active});
const faqDraft=(x:FaqContent):Draft=>({id:x.id,kind:"faq",category:x.category,title:x.question,summary:"",answer:x.answer,points:[],sortOrder:x.sortOrder,active:x.active});

export function AdminContentStudio(){
  const [tab,setTab]=useState<Kind>("guide");
  const [guides,setGuides]=useState<GuideContent[]>([]);
  const [faqs,setFaqs]=useState<FaqContent[]>([]);
  const [draft,setDraft]=useState<Draft>(blank("guide"));
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);

  async function load(){
    setLoading(true);
    try{
      const data=await listAdminSiteContent({data:{}});
      setGuides(data.guides);setFaqs(data.faqs);
    }catch(error){toast.error(error instanceof Error?error.message:"محتوای سایت دریافت نشد.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[]);

  const items=useMemo(()=>tab==="guide"?guides:faqs,[tab,guides,faqs]);

  function selectGuide(item:GuideContent){setTab("guide");setDraft(guideDraft(item));}
  function selectFaq(item:FaqContent){setTab("faq");setDraft(faqDraft(item));}
  function newItem(kind=tab){setTab(kind);setDraft(blank(kind));}
  function setPoint(index:number,value:string){setDraft(current=>({...current,points:current.points.map((item,i)=>i===index?value:item)}));}

  async function save(){
    setSaving(true);
    try{
      const result=await upsertAdminSiteContent({
        data:{
          id:draft.id||undefined,kind:draft.kind,category:draft.category,title:draft.title,summary:draft.summary,
          answer:draft.answer,points:draft.points.map(x=>x.trim()).filter(Boolean),sortOrder:draft.sortOrder,active:draft.active
        }
      });
      if(draft.kind==="guide"){
        const item=result as GuideContent;
        setGuides(current=>current.some(x=>x.id===item.id)?current.map(x=>x.id===item.id?item:x):[...current,item]);
        setDraft(guideDraft(item));
      }else{
        const item=result as FaqContent;
        setFaqs(current=>current.some(x=>x.id===item.id)?current.map(x=>x.id===item.id?item:x):[...current,item]);
        setDraft(faqDraft(item));
      }
      toast.success("محتوا ذخیره شد.");
    }catch(error){toast.error(error instanceof Error?error.message:"ذخیره محتوا انجام نشد.");}
    finally{setSaving(false);}
  }

  async function remove(){
    if(!draft.id) return;
    if(!window.confirm("این محتوای عمومی حذف شود؟")) return;
    try{
      await deleteAdminSiteContent({data:{id:draft.id}});
      if(draft.kind==="guide") setGuides(current=>current.filter(x=>x.id!==draft.id));
      else setFaqs(current=>current.filter(x=>x.id!==draft.id));
      setDraft(blank(draft.kind));
      toast.success("محتوا حذف شد.");
    }catch(error){toast.error(error instanceof Error?error.message:"حذف محتوا انجام نشد.");}
  }

  return <main className="admin-content-studio">
    <section className="admin-panel admin-content-hero">
      <div className="admin-content-hero-icon"><BookOpen size={28}/></div>
      <div><span className="kicker">مدیریت محتوای سایت</span><h2>استودیو راهنما و پرسش‌های متداول</h2><p>مطالبی که اینجا ویرایش می‌کنید مستقیماً در صفحه «راهنمای ملکی» و FAQ صفحه اصلی نمایش داده می‌شوند؛ بدون نیاز به تغییر کد.</p></div>
      <button type="button" className="btn-gold" onClick={()=>newItem()}><Plus size={15}/> مورد جدید</button>
    </section>

    <div className="admin-content-tabs">
      <button type="button" className={tab==="guide"?"is-active":""} onClick={()=>{setTab("guide");setDraft(guides[0]?guideDraft(guides[0]):blank("guide"));}}><BookOpen size={15}/> راهنماها <b>{guides.length.toLocaleString("fa-IR")}</b></button>
      <button type="button" className={tab==="faq"?"is-active":""} onClick={()=>{setTab("faq");setDraft(faqs[0]?faqDraft(faqs[0]):blank("faq"));}}><FileText size={15}/> FAQ <b>{faqs.length.toLocaleString("fa-IR")}</b></button>
    </div>

    <section className="admin-content-layout">
      <div className="admin-panel admin-content-list">
        <div className="admin-panel-head"><div><span className="kicker">{tab==="guide"?"راهنماها":"پرسش‌ها"}</span><h2>فهرست محتوا</h2></div></div>
        {loading?<div className="admin-content-empty">در حال دریافت…</div>:items.length===0?<div className="admin-content-empty">محتوایی وجود ندارد.</div>:
          tab==="guide"
            ? <div>{guides.map(item=><button type="button" key={item.id} className={"admin-content-list-row"+(draft.id===item.id?" is-active":"")} onClick={()=>selectGuide(item)}><span><strong>{item.title}</strong><small>{item.category} · {item.points.length.toLocaleString("fa-IR")} نکته</small></span><ChevronDown size={15}/></button>)}</div>
            : <div>{faqs.map(item=><button type="button" key={item.id} className={"admin-content-list-row"+(draft.id===item.id?" is-active":"")} onClick={()=>selectFaq(item)}><span><strong>{item.question}</strong><small>{item.category}</small></span><ChevronDown size={15}/></button>)}</div>
        }
      </div>

      <div className="admin-panel admin-content-editor">
        <div className="admin-panel-head"><div><span className="kicker">ویرایشگر</span><h2>{draft.id?"ویرایش محتوا":"محتوای جدید"}</h2></div>{draft.id?<button type="button" className="admin-icon-btn danger" onClick={()=>void remove()} title="حذف"><Trash2 size={16}/></button>:null}</div>
        <div className="admin-content-form">
          <div className="admin-content-two">
            <label className="admin-content-field"><span>{draft.kind==="guide"?"دسته‌بندی":"دسته‌بندی FAQ"}</span><input value={draft.category} onChange={e=>setDraft(x=>({...x,category:e.target.value}))}/></label>
            <label className="admin-content-field"><span>ترتیب نمایش</span><input type="number" value={draft.sortOrder} onChange={e=>setDraft(x=>({...x,sortOrder:Number(e.target.value)||0}))}/></label>
          </div>
          <label className="admin-content-field"><span>{draft.kind==="guide"?"عنوان راهنما":"سؤال"}</span><input value={draft.title} onChange={e=>setDraft(x=>({...x,title:e.target.value}))} placeholder={draft.kind==="guide"?"مثلاً قبل از خرید ملک چه چیزهایی را بررسی کنیم؟":"مثلاً چگونه برای بازدید ملک آماده شویم؟"}/></label>
          {draft.kind==="guide"?<>
            <label className="admin-content-field"><span>خلاصه</span><textarea rows={3} value={draft.summary} onChange={e=>setDraft(x=>({...x,summary:e.target.value}))}/></label>
            <div className="admin-content-points"><div className="admin-content-points-head"><strong>نکات راهنما</strong><button type="button" className="btn-ghost" onClick={()=>draft.points.length<12&&setDraft(x=>({...x,points:[...x.points,""]}))}><Plus size={14}/> افزودن نکته</button></div>
              {draft.points.map((point,index)=><div className="admin-content-point" key={index}><textarea rows={2} value={point} onChange={e=>setPoint(index,e.target.value)}/>{draft.points.length>1?<button type="button" className="admin-icon-btn danger" onClick={()=>setDraft(x=>({...x,points:x.points.filter((_,i)=>i!==index)}))} title="حذف نکته"><Trash2 size={14}/></button>:null}</div>)}
            </div>
          </>:<label className="admin-content-field"><span>پاسخ</span><textarea rows={10} value={draft.answer} onChange={e=>setDraft(x=>({...x,answer:e.target.value}))} placeholder="پاسخ روشن و قابل استفاده برای بازدیدکننده…"/></label>}
          <label className="admin-content-active"><input type="checkbox" checked={draft.active} onChange={e=>setDraft(x=>({...x,active:e.target.checked}))}/><span><strong>در سایت نمایش داده شود</strong><small>برای انتشار موقت می‌توانید این مورد را خاموش کنید.</small></span></label>
        </div>
        <div className="admin-content-actions"><button type="button" className="btn-ghost" onClick={()=>newItem(draft.kind)}>مورد جدید</button><button type="button" className="btn-gold" onClick={()=>void save()} disabled={saving||loading}><Save size={15}/>{saving?"در حال ذخیره…":"ذخیره محتوا"}</button></div>
      </div>
    </section>
  </main>;
}
