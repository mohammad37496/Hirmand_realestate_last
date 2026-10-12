import { useMemo, useState } from "react";
import { CalendarClock, Check, Phone, X } from "lucide-react";
import { formatPersianDate } from "@/lib/persian-date";
import { PersianDatePicker } from "./persian-date-picker";
import "@/property-callback-request.css";

type Props={propertyType?:string;neighborhood?:string;context?:string};

function digits(value:string){
  return value.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}
function today(){
  const now=new Date(); const local=new Date(now.getTime()-now.getTimezoneOffset()*60000);
  return local.toISOString().slice(0,10);
}
function toIranIso(date:string,time:string){return new Date(date+"T"+time+":00+03:30").toISOString();}
const TIMES=Array.from({length:19},(_,i)=>9*60+i*30).map(v=>String(Math.floor(v/60)).padStart(2,"0")+":"+String(v%60));

export function PropertyCallbackRequest({propertyType="",neighborhood="",context=""}:Props){
  const [open,setOpen]=useState(false),[name,setName]=useState(""),[phone,setPhone]=useState("");
  const [date,setDate]=useState(today()),[time,setTime]=useState("17:00"),[note,setNote]=useState("");
  const [busy,setBusy]=useState(false),[done,setDone]=useState(""),[error,setError]=useState("");
  const minDate=useMemo(()=>today(),[]);

  function close(){if(busy)return;setOpen(false);setDone("");setError("");}
  async function submit(){
    const mobile=digits(phone).replace(/\D/g,"");
    if(name.trim().length<2)return setError("نام و نام خانوادگی را وارد کنید.");
    if(!/^09\d{9}$/.test(mobile))return setError("شماره موبایل معتبر وارد کنید.");
    const at=toIranIso(date,time);
    if(new Date(at).getTime()<Date.now()+30*60*1000)return setError("زمان تماس باید حداقل ۳۰ دقیقه از اکنون فاصله داشته باشد.");
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/leads",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        name:name.trim(),phone:mobile,peopleCount:1,job:"",deal:"درخواست تماس",propertyType,neighborhood,consultant:"",
        note:[context,note.trim()].filter(Boolean).join("\n"),source:"website",callbackPreferredAt:at,matches:[]
      })});
      const payload=await response.json().catch(()=>null);
      if(!response.ok||!payload?.success)throw new Error(payload?.statusMessage||payload?.message||"درخواست تماس ثبت نشد.");
      setDone(String(payload.trackingToken||"ثبت شد")); 
    }catch(e){setError(e instanceof Error?e.message:"درخواست تماس ثبت نشد.");}
    finally{setBusy(false);}
  }

  return <>
    <button type="button" className="btn-ghost property-callback-trigger" onClick={()=>{setOpen(true);setError("");setDone("");}}>
      <Phone size={16}/> تماس در زمان دلخواه
    </button>
    {open?<div className="property-callback-backdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)close();}}>
      <section className="property-callback-modal" role="dialog" aria-modal="true" aria-labelledby="property-callback-title">
        <button type="button" className="property-callback-close" onClick={close} aria-label="بستن"><X size={18}/></button>
        {done?<div className="property-callback-success">
          <div className="property-callback-success-icon"><Check size={24}/></div>
          <span className="kicker">درخواست ثبت شد</span><h2 id="property-callback-title">زمان تماس شما ثبت شد.</h2>
          <p>{formatPersianDate(date)} · {time} · مشاور هیرمند با شما هماهنگ خواهد کرد.</p>
          <strong dir="ltr">{done}</strong>
          <button type="button" className="btn-gold" onClick={close}>بستن</button>
        </div>:<>
          <header><span className="kicker">تماس برنامه‌ریزی‌شده</span><h2 id="property-callback-title">چه زمانی با شما تماس بگیریم؟</h2><p>زمان پیشنهادی شما مستقیماً وارد صف پیگیری CRM هیرمند می‌شود.</p></header>
          <div className="property-callback-grid">
            <label><span>نام و نام خانوادگی</span><input value={name} onChange={e=>setName(e.target.value)} autoComplete="name"/></label>
            <label><span>شماره موبایل</span><input value={phone} onChange={e=>setPhone(e.target.value)} inputMode="tel" dir="ltr" placeholder="0912..."/></label>
            <label><span>روز تماس</span><PersianDatePicker value={date} onChange={setDate} title="روز تماس" minValue={minDate}/></label>
            <label><span>ساعت</span><select value={time} onChange={e=>setTime(e.target.value)}>{TIMES.map(t=><option key={t} value={t}>{t}</option>)}</select></label>
            <label className="property-callback-note"><span>توضیح کوتاه (اختیاری)</span><textarea rows={3} maxLength={600} value={note} onChange={e=>setNote(e.target.value)} placeholder="مثلاً فقط درباره شرایط پرداخت یا بازدید تماس بگیرید."/></label>
          </div>
          {error?<p className="property-callback-error" role="alert">{error}</p>:null}
          <div className="property-callback-actions"><button type="button" className="btn-ghost" onClick={close} disabled={busy}>انصراف</button><button type="button" className="btn-gold" onClick={()=>void submit()} disabled={busy}><CalendarClock size={16}/>{busy?"در حال ثبت…":"ثبت زمان تماس"}</button></div>
        </>}
      </section>
    </div>:null}
  </>;
}