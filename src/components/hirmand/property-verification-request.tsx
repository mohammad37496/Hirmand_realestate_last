import { useState } from "react";
import { CheckCircle2, Loader2, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Property } from "@/lib/properties";
import { trackAnalyticsEvent } from "@/lib/analytics";

function digits(value: string) {
  return value.replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "");
}

export function PropertyVerificationRequest({ property }: { property: Property }) {
  const [name,setName]=useState("");
  const [phone,setPhone]=useState("");
  const [checks,setChecks]=useState(["وضعیت فعلی فایل","قیمت و شرایط معامله","تصاویر و مشخصات ثبت‌شده","موقعیت تقریبی و محله"]);
  const [busy,setBusy]=useState(false);
  const [trackingToken,setTrackingToken]=useState("");

  function toggle(value:string) {
    setChecks(current => current.includes(value) ? current.filter(item => item !== value) : [...current, value]);
  }

  async function submit() {
    const cleanName=name.trim();
    const cleanPhone=digits(phone);
    if (cleanName.length<2) { toast.error("نام و نام خانوادگی را وارد کنید."); return; }
    if (!/^09\d{9}$/.test(cleanPhone)) { toast.error("شماره موبایل معتبر نیست."); return; }
    if (!checks.length) { toast.error("حداقل یک مورد برای بررسی انتخاب کنید."); return; }

    setBusy(true);
    try {
      const response=await fetch("/api/leads",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({
        name:cleanName,phone:cleanPhone,deal:"درخواست تأیید اطلاعات فایل",propertyId:property.id,
        propertyType:property.propertyType,neighborhood:property.neighborhood,consultant:property.contactName,
        requestedAmenities:checks,note:"موارد درخواستی برای بررسی: "+checks.join("، "),
      })});
      const payload=await response.json().catch(()=>null) as {trackingToken?:string;statusMessage?:string;message?:string};
      if (!response.ok) throw new Error(payload?.statusMessage||payload?.message||"ثبت درخواست انجام نشد.");
      setTrackingToken(payload?.trackingToken||"");
      trackAnalyticsEvent("property_verification_request",property.slug);
      toast.success("درخواست بررسی اطلاعات فایل ثبت شد.");
    } catch(error) {
      toast.error(error instanceof Error?error.message:"ثبت درخواست انجام نشد؛ دوباره تلاش کنید.");
    } finally { setBusy(false); }
  }

  return <section id="property-verification-request" className="property-verification-request" aria-labelledby="property-verification-title">
    <div className="property-verification-copy">
      <span className="kicker">اعتماد و شفافیت</span>
      <h2 id="property-verification-title">درخواست بررسی و تأیید اطلاعات این فایل</h2>
      <p>می‌توانید از تیم هیرمند بخواهید وضعیت فعلی فایل و اطلاعات اصلی آن را دوباره با مشاور و مستندات موجود بررسی کند. تا قبل از بررسی، این بخش به معنی «تأییدشده» بودن ملک نیست.</p>
    </div>
    {trackingToken ? (
      <div className="property-verification-success"><CheckCircle2 size={20}/><div><strong>درخواست ثبت شد</strong><span>کد پیگیری: <bdi dir="ltr">{trackingToken}</bdi></span><a href="/request-tracking">پیگیری درخواست</a></div></div>
    ) : <>
      <div className="property-verification-checks">
        {checks.map(item => <label key={item}><input type="checkbox" checked onChange={() => toggle(item)}/><span>{item}</span></label>)}
      </div>
      <div className="property-verification-form">
        <label className="field"><span>نام و نام خانوادگی</span><input value={name} onChange={e=>setName(e.target.value.slice(0,80))} autoComplete="name"/></label>
        <label className="field"><span>شماره موبایل</span><input value={phone} onChange={e=>setPhone(e.target.value.slice(0,14))} inputMode="tel" dir="ltr" autoComplete="tel"/></label>
        <button type="button" className="btn-gold" onClick={()=>void submit()} disabled={busy}>{busy?<Loader2 size={16}/>:<Send size={16}/>} {busy?"در حال ثبت…":"ثبت درخواست بررسی"}</button>
      </div>
      <div className="property-verification-note"><ShieldCheck size={15}/><span>در صورت تأیید توسط تیم هیرمند، نتیجه جداگانه اعلام می‌شود؛ این قابلیت ادعای ضمانت حقوقی یا کارشناسی نیست.</span></div>
    </>}
  </section>;
}
