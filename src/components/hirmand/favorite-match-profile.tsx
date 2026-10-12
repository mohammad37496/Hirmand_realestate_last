import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Target } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/favorite-match-profile.css";

type Profile={transaction:"all"|"buy"|"rent";minArea:string;maxArea:string;bedrooms:string;budget:string;parking:boolean;elevator:boolean;neighborhoods:string};
const KEY="hirmand-favorite-match-profile-v1",DEF:Profile={transaction:"all",minArea:"",maxArea:"",bedrooms:"",budget:"",parking:false,elevator:false,neighborhoods:""};
const n=(v:string)=>{const x=Number(String(v).replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[,٬]/g,""));return Number.isFinite(x)&&x>0?x:0};
const type=(p:Property)=>p.transactionType==="rent"||p.transactionType==="mortgage"?"rent":"buy";
function load(){try{const p=JSON.parse(localStorage.getItem(KEY)||"null");return p&&typeof p==="object"?{...DEF,...p,parking:Boolean(p.parking),elevator:Boolean(p.elevator)}:DEF}catch{return DEF}}
function calc(p:Property,s:Profile){let score=0;const miss:string[]=[];const min=n(s.minArea),max=n(s.maxArea),budget=n(s.budget),bed=Number(s.bedrooms)||0;
 if(s.transaction==="all"||s.transaction===type(p))score+=20;else miss.push("نوع معامله");
 if((!min||(p.areaM2||0)>=min)&&(!max||(p.areaM2||0)<=max))score+=20;else miss.push("متراژ");
 if(!bed||p.bedrooms==null||p.bedrooms>=bed)score+=15;else miss.push("خواب");
 if(!budget||!p.price||n(p.price)<=budget)score+=20;else miss.push("بودجه");
 if(!s.parking||p.parking)score+=10;else miss.push("پارکینگ");
 if(!s.elevator||p.elevator)score+=7;else miss.push("آسانسور");
 const wants=s.neighborhoods.split(",").map(x=>x.trim()).filter(Boolean);if(!wants.length||wants.some(x=>p.neighborhood.includes(x)))score+=8;else miss.push("محله");
 return{score,miss}}
export function FavoriteMatchProfile({properties}:{properties:Property[]}){
 const [s,setS]=useState<Profile>(()=>load());useEffect(()=>{try{localStorage.setItem(KEY,JSON.stringify(s))}catch{/* Storage may be blocked; the in-memory profile still works. */}},[s]);
 const rows=useMemo(()=>properties.map(p=>({p,...calc(p,s)})).sort((a,b)=>b.score-a.score),[properties,s]);
 return <section className="favorite-match-profile"><header><div><span className="kicker">تطبیق خودکار</span><h2><Target size={19}/> پروفایل معیارهای انتخاب</h2><p>سازگاری هر فایل منتخب با معیارهای شخصی شما محاسبه می‌شود.</p></div><button type="button" className="btn-ghost" onClick={()=>{setS(DEF);try{localStorage.removeItem(KEY)}catch{/* Storage may be blocked; the reset still applies in memory. */}}}><RotateCcw size={14}/> بازنشانی</button></header>
  <div className="favorite-match-grid">
   <label><span>نوع معامله</span><select value={s.transaction} onChange={e=>setS(c=>({...c,transaction:e.target.value as Profile["transaction"]}))}><option value="all">همه</option><option value="buy">خرید</option><option value="rent">اجاره / رهن</option></select></label>
   <label><span>حداقل متراژ</span><input value={s.minArea} onChange={e=>setS(c=>({...c,minArea:e.target.value}))}/></label><label><span>حداکثر متراژ</span><input value={s.maxArea} onChange={e=>setS(c=>({...c,maxArea:e.target.value}))}/></label>
   <label><span>حداقل خواب</span><input value={s.bedrooms} onChange={e=>setS(c=>({...c,bedrooms:e.target.value}))}/></label><label><span>سقف بودجه</span><input value={s.budget} onChange={e=>setS(c=>({...c,budget:e.target.value}))}/></label><label><span>محله‌های ترجیحی</span><input value={s.neighborhoods} onChange={e=>setS(c=>({...c,neighborhoods:e.target.value}))} placeholder="مثلاً مرکزی، شهرک"/></label>
   <label className="favorite-match-check"><input type="checkbox" checked={s.parking} onChange={e=>setS(c=>({...c,parking:e.target.checked}))}/><span>پارکینگ الزامی</span></label><label className="favorite-match-check"><input type="checkbox" checked={s.elevator} onChange={e=>setS(c=>({...c,elevator:e.target.checked}))}/><span>آسانسور الزامی</span></label>
  </div>
  <div className="favorite-match-list">{rows.map(r=><article key={r.p.id}><strong>{r.score.toLocaleString("fa-IR")}</strong><div><b>{r.p.title}</b><small>{r.p.neighborhood}</small><span>{r.miss.length?"موارد عدم تطابق: "+r.miss.join("، "):"تمام معیارهای واردشده منطبق است."}</span></div></article>)}</div></section>
}