import { useMemo } from "react";
import { BarChart3, Building2, Ruler, WalletCards } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import "@/favorite-neighborhood-snapshot.css";

function num(v:string|null|undefined){const n=Number(String(v??"").replace(/[,٬]/g,"").trim());return Number.isFinite(n)&&n>0?n:0}
function kind(p:Property){return p.transactionType==="rent"||p.transactionType==="mortgage"?"اجاره/رهن":"خرید"}
export function FavoriteNeighborhoodSnapshot({properties}:{properties:Property[]}){
 const rows=useMemo(()=>{const map=new Map<string,Property[]>();for(const p of properties){const key=p.neighborhood+"|"+kind(p);map.set(key,[...(map.get(key)||[]),p])}
 return Array.from(map.entries()).map(([key,list])=>{const prices=list.map(p=>num(p.price)).filter(Boolean);const rents=list.map(p=>num(p.rent)).filter(Boolean);const deposits=list.map(p=>num(p.deposit)).filter(Boolean);const areas=list.map(p=>p.areaM2||0).filter(v=>v>0);const avgPrice=prices.length?prices.reduce((a,b)=>a+b,0)/prices.length:0;const avgArea=areas.length?areas.reduce((a,b)=>a+b,0)/areas.length:0;const avgPerM=avgPrice&&avgArea&&kind(list[0])==="خرید"?avgPrice/avgArea:0;return{neighborhood:list[0].neighborhood,type:kind(list[0]),count:list.length,avgPrice,avgPerM,avgArea,avgRent:rents.length?rents.reduce((a,b)=>a+b,0)/rents.length:0,avgDeposit:deposits.length?deposits.reduce((a,b)=>a+b,0)/deposits.length:0}}).sort((a,b)=>b.count-a.count)},[properties]);
 if(!properties.length)return null;
 return <section className="favorite-neighborhood-snapshot"><header><div><span className="kicker">نمای سبد</span><h2><BarChart3 size={19}/> مقایسه فایل‌ها بر اساس محله</h2><p>این اعداد فقط از فایل‌های ذخیره‌شده شما محاسبه می‌شوند و آمار رسمی بازار نیستند.</p></div><Building2 size={22}/></header>
  <div className="favorite-neighborhood-grid">{rows.slice(0,10).map(r=><article key={r.neighborhood+"-"+r.type}><div className="favorite-neighborhood-card-head"><strong>{r.neighborhood}</strong><span>{r.type} · {r.count.toLocaleString("fa-IR")} فایل</span></div><div className="favorite-neighborhood-metrics"><div><Ruler size={13}/><span>میانگین متراژ</span><b>{r.avgArea?r.avgArea.toLocaleString("fa-IR",{maximumFractionDigits:1})+" متر":"—"}</b></div>{r.type==="خرید"?<><div><WalletCards size={13}/><span>میانگین قیمت</span><b>{r.avgPrice?formatToman(Math.round(r.avgPrice))+" تومان":"—"}</b></div><div><span>میانگین هر متر</span><b>{r.avgPerM?formatToman(Math.round(r.avgPerM))+" تومان":"—"}</b></div></>:<><div><WalletCards size={13}/><span>میانگین رهن</span><b>{r.avgDeposit?formatToman(Math.round(r.avgDeposit))+" تومان":"—"}</b></div><div><span>میانگین اجاره</span><b>{r.avgRent?formatToman(Math.round(r.avgRent))+" تومان":"—"}</b></div></>}</div></article>)}</div>
 </section>
}