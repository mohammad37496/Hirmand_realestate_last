import { useState } from "react";
import { Check, ClipboardCopy, FileText, MessageCircle, Printer, RotateCcw } from "lucide-react";
import type { Property } from "@/lib/properties";
import { SITE } from "@/lib/site";
import "@/property-document-pack.css";

type Doc={id:string;title:string;required:boolean};
function items(p:Property):Doc[]{
 if(p.transactionType==="rent")return[
 {id:"authority",title:"مدرک مالکیت یا مدرک اختیار قانونی برای اجاره",required:true},
 {id:"id",title:"کارت ملی موجر و اطلاعات تماس قابل تطبیق",required:true},
 {id:"terms",title:"مبلغ رهن/ودیعه و اجاره نهایی",required:true},
 {id:"handover",title:"تاریخ و شرایط دقیق تحویل",required:true},
 {id:"settle",title:"وضعیت تسویه قبوض و شارژ تا زمان تحویل",required:false},
 ];
 if(p.transactionType==="mortgage")return[
 {id:"authority",title:"مدرک مالکیت و وضعیت رهن فعلی",required:true},
 {id:"id",title:"کارت ملی مالک و مشخصات قابل تطبیق",required:true},
 {id:"finance",title:"مبلغ رهن و شرایط فک/تسویه رهن",required:true},
 {id:"handover",title:"زمان و شرایط تحویل",required:true},
 ];
 return[
 {id:"title",title:"مدرک مالکیت/سند و مشخصات مالک",required:true},
 {id:"id",title:"کارت ملی مالک و مشخصات قابل تطبیق",required:true},
 {id:"status",title:"وضعیت رهن، بازداشت و محدودیت‌های ثبتی",required:true},
 {id:"building",title:"مدارک مرتبط با پایان‌کار/تفکیک/پارکینگ در صورت نیاز",required:false},
 {id:"terms",title:"قیمت نهایی و شرایط پرداخت توافق‌شده",required:true},
 {id:"handover",title:"تاریخ و شرایط تحویل",required:true},
 {id:"settle",title:"وضعیت قبوض، شارژ و تعهدات مالی تا زمان تحویل",required:false},
 ];
}
export function PropertyDocumentPack({property}:{property:Property}){
 const key="hirmand-property-document-pack-v1:"+property.id;const initial=items(property);const [checked,setChecked]=useState<Record<string,boolean>>(()=>{try{return JSON.parse(localStorage.getItem(key)||"{}")}catch{return{}}});
 const [note,setNote]=useState("");
 const list=initial;
 const toggle=(id:string)=>setChecked(c=>{const n={...c,[id]:!c[id]};try{localStorage.setItem(key,JSON.stringify(n))}catch{/* Storage may be blocked; the in-memory checklist still works. */}return n});
 const message=["سلام، برای بررسی و ادامه روند فایل «"+property.title+"» لطفاً موارد زیر را برای بررسی ارسال/آماده کنید:",...list.map(x=>(checked[x.id]?"✓ ":"□ ")+x.title),note.trim()?"یادداشت: "+note.trim():"","این فهرست برای مدیریت شخصی روند بررسی است و جایگزین مشاوره حقوقی نیست."].filter(Boolean).join("\n");
 return <section className="property-document-pack"><header><div><span className="kicker">مدارک و اطلاعات</span><h2><FileText size={20}/> بسته درخواست مدارک و اطلاعات</h2><p>به‌جای فرستادن درخواست‌های پراکنده، یک فهرست آماده برای مالک/مشاور بسازید.</p></div><div className="property-document-pack-actions"><button className="btn-ghost" type="button" onClick={()=>window.print()}><Printer size={14}/> چاپ</button><button className="btn-gold" type="button" onClick={()=>navigator.clipboard?.writeText(message)}><ClipboardCopy size={14}/> کپی متن</button><a className="btn-ghost" href={SITE.whatsappDirect+"?text="+encodeURIComponent(message)} target="_blank" rel="noreferrer"><MessageCircle size={14}/> واتساپ</a></div></header><div className="property-document-pack-list">{list.map(x=><label key={x.id} className={checked[x.id]?"is-done":""}><input type="checkbox" checked={Boolean(checked[x.id])} onChange={()=>toggle(x.id)}/><span><strong>{x.title}</strong>{x.required?<small>مورد مهم</small>:<small>اختیاری</small>}</span><Check size={14}/></label>)}</div><textarea value={note} onChange={e=>setNote(e.target.value.slice(0,500))} placeholder="یادداشت برای مالک/مشاور، مثلاً «تصویر واضح صفحات سند کافی است»..." rows={3}/><button type="button" className="property-document-reset" onClick={()=>{setChecked({});try{localStorage.removeItem(key)}catch{/* Storage may be blocked; the reset still applies in memory. */}}}><RotateCcw size={13}/> بازنشانی وضعیت</button></section>
}