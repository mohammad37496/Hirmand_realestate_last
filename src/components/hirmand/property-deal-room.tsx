import { useEffect, useMemo, useState } from "react";
import { Check, ChevronLeft, ClipboardCheck, FileCheck2, FlagTriangleRight, ListChecks, Plus, Printer, Trash2, UserRound } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-deal-room.css";
import { PersianDatePicker } from "./persian-date-picker";

type DealStage = "مذاکره" | "توافق اولیه" | "بیعانه" | "قرارداد" | "تسویه" | "تحویل";
type DealCategory = "مدرک" | "مالی" | "حقوقی" | "تحویل" | "پیگیری";
type DealStatus = "باز" | "درحال‌پیگیری" | "تکمیل";
type Item = { id:string; title:string; stage:DealStage; category:DealCategory; status:DealStatus; required:boolean; note:string; dueDate:string };
type State = { stage:DealStage; responsible:"خریدار"|"فروشنده"|"مشاور"; targetDate:string; items:Item[] };

const KEY="hirmand-property-deal-room-v1:", LEGACY="hirmand-deal-checklist-v1:", PAY="hirmand-payment-plan-v1:", NEG="hirmand-property-negotiation-log-v1:";
const STAGES:DealStage[]=["مذاکره","توافق اولیه","بیعانه","قرارداد","تسویه","تحویل"];
const SEEDS:Array<Omit<Item,"id"|"status"|"note"|"dueDate">>=[
{title:"هدف قیمت و محدوده قابل مذاکره مشخص شده",stage:"مذاکره",category:"مالی",required:false},
{title:"پیشنهاد یا آخرین قیمت ثبت شده است",stage:"مذاکره",category:"مالی",required:false},
{title:"شخص مسئول پیگیری مرحله مشخص شده است",stage:"مذاکره",category:"پیگیری",required:true},
{title:"قیمت و شرایط پرداخت اولیه روشن است",stage:"توافق اولیه",category:"مالی",required:true},
{title:"زمان‌بندی کلی قرارداد و تحویل مشخص است",stage:"توافق اولیه",category:"پیگیری",required:true},
{title:"توافقات کلیدی در یادداشت ثبت شده است",stage:"توافق اولیه",category:"حقوقی",required:false},
{title:"مدارک اولیه مالک و ملک بررسی شده است",stage:"بیعانه",category:"مدرک",required:true},
{title:"وضعیت رهن، بازداشت و محدودیت‌های مرتبط بررسی شده است",stage:"بیعانه",category:"حقوقی",required:true},
{title:"مبلغ و روش پرداخت بیعانه مشخص است",stage:"بیعانه",category:"مالی",required:true},
{title:"مبلغ نهایی و شرایط قرارداد نهایی شده است",stage:"قرارداد",category:"مالی",required:true},
{title:"کمیسیون و مسئولیت‌های پرداخت مشخص شده است",stage:"قرارداد",category:"مالی",required:true},
{title:"زمان دقیق تحویل و بندهای مهم قرارداد ثبت شده است",stage:"قرارداد",category:"حقوقی",required:true},
{title:"قبوض، شارژ و تعهدات قابل‌تسویه بررسی شده‌اند",stage:"تسویه",category:"مالی",required:true},
{title:"مبلغ و تاریخ تسویه نهایی مشخص است",stage:"تسویه",category:"مالی",required:true},
{title:"کلیدها و متعلقات تحویل مشخص شده‌اند",stage:"تحویل",category:"تحویل",required:true},
{title:"پارکینگ، انباری و کنتورها تطبیق داده شده‌اند",stage:"تحویل",category:"تحویل",required:true},
{title:"صورتجلسه تحویل و موارد باقی‌مانده ثبت شده است",stage:"تحویل",category:"تحویل",required:true}
];
const LABEL:Record<DealStage,string>={"مذاکره":"مذاکره","توافق اولیه":"توافق اولیه","بیعانه":"بیعانه","قرارداد":"قرارداد","تسویه":"تسویه","تحویل":"تحویل"};
const id=()=>typeof crypto!=="undefined"&&"randomUUID"in crypto?crypto.randomUUID():Math.random().toString(36).slice(2);
const fa=(n:number)=>n.toLocaleString("fa-IR");
function defaults():State{return{stage:"مذاکره",responsible:"مشاور",targetDate:"",items:SEEDS.map(x=>({...x,id:id(),status:"باز",note:"",dueDate:""}))};}
function read(idv:string):State{if(typeof window==="undefined")return defaults();try{const p=JSON.parse(localStorage.getItem(KEY+idv)||"null");if(!p||typeof p!=="object")return defaults();const items=Array.isArray(p.items)?p.items.filter(Boolean).map((x:any)=>({id:typeof x.id==="string"?x.id:id(),title:typeof x.title==="string"?x.title.slice(0,220):"مورد جدید",stage:STAGES.includes(x.stage)?x.stage:"مذاکره",category:["مدرک","مالی","حقوقی","تحویل","پیگیری"].includes(x.category)?x.category:"پیگیری",status:["باز","درحال‌پیگیری","تکمیل"].includes(x.status)?x.status:"باز",required:Boolean(x.required),note:typeof x.note==="string"?x.note.slice(0,500):"",dueDate:typeof x.dueDate==="string"?x.dueDate:""})).slice(0,50):[];return{stage:STAGES.includes(p.stage)?p.stage:"مذاکره",responsible:["خریدار","فروشنده","مشاور"].includes(p.responsible)?p.responsible:"مشاور",targetDate:typeof p.targetDate==="string"?p.targetDate:"",items:items.length?items:defaults().items};}catch{return defaults();}}
function legacy(idv:string){try{const p=JSON.parse(localStorage.getItem(LEGACY+idv)||"null");return Array.isArray(p)?{done:p.filter(Boolean).length,total:p.length}:{done:0,total:0};}catch{return{done:0,total:0};}}
function pay(idv:string){try{const p=JSON.parse(localStorage.getItem(PAY+idv)||"null");return{a:typeof p?.firstPaymentDate==="string"?p.firstPaymentDate:"",b:typeof p?.handoverDate==="string"?p.handoverDate:""};}catch{return{a:"",b:""};}}
function neg(idv:string){try{const p=JSON.parse(localStorage.getItem(NEG+idv)||"null");return Array.isArray(p)?p.length:0;}catch{return 0;}}
function today(){return new Date().toISOString().slice(0,10);}

export function PropertyDealRoom({property}:{property:Property}){
 const [s,setS]=useState<State>(()=>read(property.id)),[old,setOld]=useState(()=>legacy(property.id)),[payment,setPayment]=useState(()=>pay(property.id)),[negCount,setNegCount]=useState(()=>neg(property.id));
 useEffect(()=>{try{localStorage.setItem(KEY+property.id,JSON.stringify(s));}catch{/* Storage may be blocked; the in-memory checklist still works. */}},[property.id,s]);
 useEffect(()=>{const sync=()=>{setOld(legacy(property.id));setPayment(pay(property.id));setNegCount(neg(property.id));};window.addEventListener("storage",sync);const t=window.setInterval(sync,1500);return()=>{window.removeEventListener("storage",sync);window.clearInterval(t);};},[property.id]);
 const idx=STAGES.indexOf(s.stage),items=useMemo(()=>s.items.filter(x=>x.stage===s.stage),[s.items,s.stage]),req=items.filter(x=>x.required),allReq=s.items.filter(x=>x.required),done=req.filter(x=>x.status==="تکمیل").length,allDone=allReq.filter(x=>x.status==="تکمیل").length,open=s.items.filter(x=>x.status!=="تکمیل"),overdue=open.filter(x=>x.dueDate&&x.dueDate<today()).length,next=open.map(x=>x.dueDate).filter(Boolean).sort()[0]||"",pct=allReq.length?Math.round(allDone/allReq.length*100):0,can=idx<5&&req.every(x=>x.status==="تکمیل"),linkedDate=payment.a||payment.b;
 const patch=(idv:string,p:Partial<Item>)=>setS(c=>({...c,items:c.items.map(x=>x.id===idv?{...x,...p}:x)}));
 return <section className="property-deal-room" aria-labelledby="property-deal-room-title">
  <header className="property-deal-room-head"><div><span className="kicker">مدیریت روند معامله</span><h2 id="property-deal-room-title"><ClipboardCheck size={21}/> اتاق معامله</h2><p>مراحل، مسئول پیگیری، موعدها و موارد باز این فایل را یک‌جا نگه دارید. این ابزار جایگزین بررسی حقوقی، کارشناسی یا تأیید مدارک نیست.</p></div><button type="button" className="btn-ghost" onClick={()=>window.print()}><Printer size={15}/> چاپ وضعیت</button></header>
  <div className="property-deal-room-stagebar">{STAGES.map((st,i)=><button type="button" key={st} className={"property-deal-room-stage "+(st===s.stage?"is-current ":"")+(i<idx?"is-done":"")} onClick={()=>setS(c=>({...c,stage:st}))}><span>{fa(i+1)}</span><strong>{LABEL[st]}</strong></button>)}</div>
  <div className="property-deal-room-overview">
   <div><span>پیشرفت کل</span><strong>{fa(pct)}٪</strong><small>{fa(allDone)} از {fa(allReq.length)} مورد ضروری</small></div>
   <div><span>موارد باز</span><strong>{fa(open.length)}</strong><small>{overdue?fa(overdue)+" مورد سررسید گذشته":"عقب‌افتادگی ثبت نشده"}</small></div>
   <div><span>موعد بعدی</span><strong>{next?new Date(next+"T12:00:00").toLocaleDateString("fa-IR-u-ca-persian"):"ثبت نشده"}</strong><small>{linkedDate?"پرداخت/تحویل: "+new Date(linkedDate+"T12:00:00").toLocaleDateString("fa-IR-u-ca-persian"):"تاریخ پرداخت/تحویل ثبت نشده"}</small></div>
   <div><span>مسئول فعلی</span><strong><UserRound size={15}/>{s.responsible}</strong><small>{negCount?fa(negCount)+" سابقه مذاکره":"سابقه مذاکره ثبت نشده"}</small></div>
  </div>
  <div className="property-deal-room-controls">
   <label><span>مسئول فعلی</span><select value={s.responsible} onChange={e=>setS(c=>({...c,responsible:e.target.value as State["responsible"]}))}><option>خریدار</option><option>فروشنده</option><option>مشاور</option></select></label>
   <label><span>تاریخ هدف معامله</span><PersianDatePicker value={s.targetDate} onChange={value=>setS(c=>({...c,targetDate:value}))} title="تاریخ هدف معامله" hint="" /></label>
   <div className="property-deal-room-legacy"><FileCheck2 size={16}/><span>چک‌لیست قبلی:</span><strong>{old.total?fa(old.done)+" از "+fa(old.total):"ثبت نشده"}</strong></div>
  </div>
  <div className="property-deal-room-current-head"><div><span className="kicker">مرحله جاری</span><h3>{LABEL[s.stage]}</h3></div><div className="property-deal-room-current-meta">{fa(done)} از {fa(req.length)} مورد ضروری</div></div>
  <div className="property-deal-room-list">{items.map(x=><article className={"property-deal-room-item "+(x.status==="تکمیل"?"is-done":"")} key={x.id}>
   <button type="button" className="property-deal-room-check" onClick={()=>patch(x.id,{status:x.status==="تکمیل"?"باز":"تکمیل"})} aria-label="تکمیل مورد">{x.status==="تکمیل"?<Check size={16}/>:null}</button>
   <div className="property-deal-room-item-main">
    <div className="property-deal-room-item-top"><input value={x.title} onChange={e=>patch(x.id,{title:e.target.value.slice(0,220)})}/><div className="property-deal-room-item-badges">{x.required?<span className="is-required"><FlagTriangleRight size={12}/> ضروری</span>:null}<span>{x.category}</span></div></div>
    <div className="property-deal-room-item-fields">
     <label><span>موعد</span><PersianDatePicker value={x.dueDate} onChange={value=>patch(x.id,{dueDate:value})} title="موعد پیگیری" hint="" /></label>
     <label><span>وضعیت</span><select value={x.status} onChange={e=>patch(x.id,{status:e.target.value as DealStatus})}><option>باز</option><option>درحال‌پیگیری</option><option>تکمیل</option></select></label>
     <label className="deal-room-note-field"><span>یادداشت</span><input value={x.note} onChange={e=>patch(x.id,{note:e.target.value.slice(0,500)})} placeholder="مرجع مدرک، مسئول بعدی یا نکته مهم"/></label>
    </div>
   </div>
   <button type="button" className="property-deal-room-remove" onClick={()=>setS(c=>({...c,items:c.items.filter(i=>i.id!==x.id)}))} aria-label="حذف مورد"><Trash2 size={15}/></button>
  </article>)}</div>
  <div className="property-deal-room-footer"><button type="button" className="btn-ghost" onClick={()=>setS(c=>{const item:Item={id:id(),title:"مورد جدید",stage:c.stage,category:"پیگیری",status:"باز",required:false,note:"",dueDate:""};return {...c,items:[...c.items,item].slice(0,50)};})}><Plus size={15}/> افزودن مورد</button>
   <div className="property-deal-room-next"><span><ListChecks size={15}/> مرحله بعد فقط با تکمیل موارد ضروری فعال است.</span>{idx<5?<button type="button" className="btn-gold" disabled={!can} onClick={()=>setS(c=>({...c,stage:STAGES[idx+1]}))}><ChevronLeft size={15}/> انتقال به {LABEL[STAGES[idx+1]]}</button>:<span className="property-deal-room-complete"><Check size={15}/> آخرین مرحله</span>}</div>
  </div>
 </section>;
}
