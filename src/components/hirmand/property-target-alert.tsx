import { useEffect, useState } from "react";
import { BellRing, Check, Loader2, RefreshCw, Target, X } from "lucide-react";
import { toast } from "sonner";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { isPropertyWatchTargetMutationSuccessful } from "@/lib/property-watch-target-response";

type TargetType = "price" | "deposit" | "rent";
function normalize(value:string){
  const translated=value.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[٬,]/g,"");
  const n=Number(translated.replace(/\D/g,""));
  return Number.isFinite(n)&&n>0?Math.round(n):null;
}
function targetFor(property:Property):{type:TargetType;label:string;current:string|null}{
  if(property.transactionType==="rent") return {type:"rent",label:"اجاره",current:property.rent};
  if(property.transactionType==="mortgage") return {type:"deposit",label:"رهن",current:property.deposit};
  return {type:"price",label:"قیمت",current:property.price};
}
export function PropertyTargetAlert({property}:{property:Property}){
  const target=targetFor(property);
  const [amount,setAmount]=useState("");
  const [saved,setSaved]=useState<number|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [loadError,setLoadError]=useState<string|null>(null);
  const [retryKey,setRetryKey]=useState(0);

  useEffect(()=>{let cancelled=false;setLoading(true);setLoadError(null);
    void (async()=>{try{
      const response=await fetch("/api/property-watch",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"sync"})});
      const data=await response.json().catch(()=>null) as {subscriptions?:Array<{slug:string;target?:Record<string,unknown>}>;statusMessage?:string}|null;
      if(!response.ok)throw new Error(data?.statusMessage||"وضعیت هشدار قیمت دریافت نشد.");
      if(cancelled)return;
      const item=data?.subscriptions?.find((s)=>s.slug===property.slug);
      const value=item?.target?.[target.type];
      if(Number.isFinite(Number(value))&&Number(value)>0){setSaved(Number(value));setAmount(String(Math.round(Number(value))));}
      else {setSaved(null);setAmount("");}
    }catch(error){if(!cancelled)setLoadError(error instanceof Error?error.message:"وضعیت هشدار قیمت دریافت نشد.");}
    finally{if(!cancelled)setLoading(false);}})();
    return()=>{cancelled=true};
  },[property.slug,target.type,retryKey]);

  async function save(value:number|null){
    setBusy(true);
    try{
      const response=await fetch("/api/property-watch-target",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:value?"set":"clear",slug:property.slug,target:target.type,amount:value})});
      const payload=await response.json().catch(()=>null) as {statusMessage?:string;ok?:boolean;enabled?:boolean;target?:{type?:string;amount?:number|null}|null}|null;
      if(!response.ok||!isPropertyWatchTargetMutationSuccessful(payload,{type:target.type,amount:value}))throw new Error(payload?.statusMessage||"ثبت هدف انجام نشد.");
      setSaved(value);
      if(value){toast.success("هدف قیمت ثبت شد؛ وقتی مبلغ فایل به این عدد برسد اعلان می‌گیرید.");trackAnalyticsEvent("property_price_target",property.slug);}
      else toast.success("هدف قیمت حذف شد.");
    }catch(e){const message=e instanceof Error?e.message:"ثبت هدف انجام نشد.";setLoadError(message);toast.error(message);}
    finally{setBusy(false);}
  }

  const parsed=normalize(amount);
  const current=target.current?Number(String(target.current).replace(/[,٬]/g,"")):null;
  return <section className="property-target-alert" id="property-target-alert" aria-labelledby="property-target-title">
    <div className="property-target-head"><div><span className="kicker">هشدار هوشمند</span><h2 id="property-target-title">برای این فایل قیمت هدف بگذارید</h2><p>مثلاً اگر {target.label} به عدد موردنظر شما رسید، هیرمند در همین مرورگر اطلاع می‌دهد.</p></div><span className="property-target-icon"><Target size={20}/></span></div>
    {loadError?<div className="property-open-house-empty" role="alert"><strong>هشدار قیمت در دسترس نیست</strong><p>{loadError}</p><button type="button" className="btn-ghost" onClick={()=>setRetryKey(value=>value+1)} disabled={loading}><RefreshCw size={14}/> تلاش مجدد</button></div>:null}
    <div className="property-target-grid">
      <label className="property-target-field"><span>حد هدف {target.label} (تومان)</span><input dir="ltr" inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value.replace(/[^\d۰-۹٠-٩٬,]/g,"").slice(0,18))} placeholder="مثلاً ۲۵۰۰۰۰۰۰۰۰۰"/></label>
      <div className="property-target-current"><span>مقدار فعلی</span><strong>{current&&current>0?formatToman(current)+" تومان":"ثبت نشده"}</strong>{saved?<small><Check size={14}/> هدف فعلی: {formatToman(saved)} تومان</small>:<small><BellRing size={14}/> اعلان فقط برای همین مرورگر است.</small>}</div>
    </div>
    <div className="property-target-actions"><button type="button" className="btn-gold" disabled={busy||loading||!!loadError||!parsed} onClick={()=>void save(parsed)}>{busy?<Loader2 size={15}/>:<BellRing size={15}/>} ثبت هدف</button>{saved?<button type="button" className="btn-ghost" disabled={busy||!!loadError} onClick={()=>{setAmount("");void save(null)}}><X size={15}/> حذف هدف</button>:null}</div>
  </section>;
}
