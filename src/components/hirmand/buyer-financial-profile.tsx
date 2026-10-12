import { useEffect, useMemo, useState } from "react";
import { Calculator, RotateCcw, WalletCards } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import "@/buyer-financial-profile.css";

type Mode="buy"|"rent";
type Profile={mode:Mode;cash:string;monthly:string;months:number;reserve:string;reno:string;deposit:string;rent:string};
const KEY="hirmand-buyer-financial-profile-v1";
const DEF:Profile={mode:"buy",cash:"",monthly:"",months:24,reserve:"",reno:"",deposit:"",rent:""};
const digits=(v:string)=>v.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const amt=(v:string)=>{const n=Number(digits(v).replace(/[,٬]/g,"").trim());return Number.isFinite(n)&&n>0?n:0};
const money=(n:number)=>n>0?formatToman(Math.round(n))+" تومان":"ثبت نشده";
function read():Profile{if(typeof window==="undefined")return DEF;try{const p=JSON.parse(localStorage.getItem(KEY)||"null");if(!p||typeof p!=="object")return DEF;return{mode:p.mode==="rent"?"rent":"buy",cash:typeof p.cash==="string"?p.cash:"",monthly:typeof p.monthly==="string"?p.monthly:"",months:Number.isFinite(p.months)?Math.min(60,Math.max(1,Number(p.months))):24,reserve:typeof p.reserve==="string"?p.reserve:"",reno:typeof p.reno==="string"?p.reno:"",deposit:typeof p.deposit==="string"?p.deposit:"",rent:typeof p.rent==="string"?p.rent:""};}catch{return DEF;}}
export function BuyerFinancialProfile({properties}:{properties:Property[]}){
 const [p,setP]=useState<Profile>(()=>read());
 useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(p));}catch{/* Storage may be blocked; the in-memory profile still works. */}},[p]);
 const s=useMemo(()=>{const cash=amt(p.cash),monthly=amt(p.monthly),reserve=amt(p.reserve),reno=amt(p.reno),usable=Math.max(0,cash-reserve-reno),finance=monthly*p.months;return{usable,finance,total:usable+finance};},[p]);
 const rows=useMemo(()=>{const dep=amt(p.deposit),rent=amt(p.rent);return properties.map(property=>{
  if(p.mode==="buy"&&(property.transactionType==="buy"||property.transactionType==="sell")){const price=amt(property.price||"");if(!price)return{property,label:"قیمت ثبت نشده"};if(price<=s.usable)return{property,label:"قابل بررسی با نقدینگی"};if(price<=s.total)return{property,label:"قابل بررسی با اقساط"};return{property,label:"بالاتر از بودجه ثبت‌شده"};}
  if(p.mode==="rent"&&property.transactionType==="rent"){const a=amt(property.deposit||""),b=amt(property.rent||"");if(!a&&!b)return{property,label:"اطلاعات مالی ناقص"};return{property,label:(!dep||!a||a<=dep)&&(!rent||!b||b<=rent)?"داخل سقف‌های شما":"بالاتر از یکی از سقف‌ها"};}
  if(p.mode==="rent"&&property.transactionType==="mortgage"){const a=amt(property.deposit||"");return{property,label:a?(!dep||a<=dep?"داخل سقف رهن":"بالاتر از سقف رهن"):"رهن ثبت نشده"};}
  return null;
 }).filter((x):x is {property:Property;label:string}=>Boolean(x));},[p.mode,p.deposit,p.rent,properties,s.usable,s.total]);
 const reset=()=>{setP(DEF);try{localStorage.removeItem(KEY);}catch{/* Storage may be blocked; the reset still applies in memory. */}};
 return <section className="buyer-financial-profile" aria-labelledby="buyer-financial-profile-title">
  <header className="buyer-financial-profile-head"><div><span className="kicker">پروفایل مالی شخصی</span><h2 id="buyer-financial-profile-title"><WalletCards size={20}/> بودجه من برای خرید یا اجاره</h2><p>این اعداد فقط روی همین مرورگر ذخیره می‌شوند و برای برآورد شخصی هستند؛ هزینه‌های قطعی حقوقی، مالیاتی، وام و شرایط قرارداد را تأیید نمی‌کنند.</p></div><div className="buyer-financial-profile-actions"><button type="button" className="btn-ghost" onClick={()=>window.print()}><Calculator size={15}/> چاپ پروفایل</button><button type="button" className="btn-ghost" onClick={reset}><RotateCcw size={15}/> پاک‌کردن</button></div></header>
  <div className="buyer-financial-mode"><button type="button" className={p.mode==="buy"?"is-active":""} onClick={()=>setP(c=>({...c,mode:"buy"}))}>خرید</button><button type="button" className={p.mode==="rent"?"is-active":""} onClick={()=>setP(c=>({...c,mode:"rent"}))}>اجاره / رهن</button></div>
  {p.mode==="buy"?<><div className="buyer-financial-grid">
   <label><span>نقدینگی فعلی (تومان)</span><input inputMode="numeric" value={p.cash} onChange={e=>setP(c=>({...c,cash:e.target.value}))} placeholder="مثلاً ۳٬۰۰۰٬۰۰۰٬۰۰۰"/></label>
   <label><span>حداکثر قسط ماهانه (تومان)</span><input inputMode="numeric" value={p.monthly} onChange={e=>setP(c=>({...c,monthly:e.target.value}))} placeholder="مثلاً ۵۰٬۰۰۰٬۰۰۰"/></label>
   <label><span>مدت تأمین مالی</span><select value={p.months} onChange={e=>setP(c=>({...c,months:Number(e.target.value)}))} dir="ltr">{[6,12,18,24,36,48,60].map(n=><option key={n} value={n}>{n.toLocaleString("fa-IR")} ماه</option>)}</select></label>
   <label><span>ذخیره هزینه‌های معامله (تومان)</span><input inputMode="numeric" value={p.reserve} onChange={e=>setP(c=>({...c,reserve:e.target.value}))} placeholder="برای هزینه‌های جانبی"/></label>
   <label><span>بودجه بازسازی/تجهیز (تومان)</span><input inputMode="numeric" value={p.reno} onChange={e=>setP(c=>({...c,reno:e.target.value}))} placeholder="اختیاری"/></label>
  </div><div className="buyer-financial-summary"><div><span>نقدینگی قابل‌استفاده</span><strong>{money(s.usable)}</strong></div><div><span>ظرفیت اقساط ثبت‌شده</span><strong>{money(s.finance)}</strong></div><div><span>بودجه خرید قابل بررسی</span><strong>{money(s.total)}</strong></div></div></>
  :<><div className="buyer-financial-grid buyer-financial-grid-rent"><label><span>سقف رهن / ودیعه (تومان)</span><input inputMode="numeric" value={p.deposit} onChange={e=>setP(c=>({...c,deposit:e.target.value}))} placeholder="مثلاً ۵۰۰٬۰۰۰٬۰۰۰"/></label><label><span>سقف اجاره ماهانه (تومان)</span><input inputMode="numeric" value={p.rent} onChange={e=>setP(c=>({...c,rent:e.target.value}))} placeholder="مثلاً ۲۰٬۰۰۰٬۰۰۰"/></label></div><div className="buyer-financial-summary buyer-financial-summary-2"><div><span>سقف رهن / ودیعه</span><strong>{money(amt(p.deposit))}</strong></div><div><span>سقف اجاره ماهانه</span><strong>{money(amt(p.rent))}</strong></div></div></>}
  {rows.length?<div className="buyer-financial-matches"><div className="buyer-financial-matches-head"><div><span className="kicker">تطبیق با فایل‌های منتخب</span><h3>وضعیت بودجه هر فایل</h3></div><span>{rows.length.toLocaleString("fa-IR")} فایل</span></div><div className="buyer-financial-row-list">{rows.map(x=><div className="buyer-financial-row" key={x.property.id}><div><strong>{x.property.title}</strong><span>{x.property.neighborhood} · {x.property.transactionType==="rent"?"اجاره":x.property.transactionType==="mortgage"?"رهن":"خرید"}</span></div><span className={"buyer-financial-pill "+((x.label.includes("داخل")||x.label.includes("قابل"))?"is-ok":"is-warn")}>{x.label}</span></div>)}</div></div>:null}
 </section>;
}
