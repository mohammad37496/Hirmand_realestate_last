import { useState } from "react";
import { CheckCircle2, FileText, HardHat, ImagePlus, Loader2, Scale, Send, ShieldCheck, X } from "lucide-react";
import { toast } from "sonner";
import type { Property } from "@/lib/properties";
import { trackAnalyticsEvent } from "@/lib/analytics";

type RequestKind = "technical" | "media" | "legal";

type RequestMeta = {
  deal: string;
  title: string;
  description: string;
  icon: typeof HardHat;
  notePlaceholder: string;
};

const REQUESTS: Record<RequestKind, RequestMeta> = {
  technical: {
    deal: "درخواست کارشناسی فنی",
    title: "کارشناسی فنی قبل از معامله",
    description: "درخواست بررسی حضوری وضعیت عمومی ملک و موارد فنی که بهتر است قبل از تصمیم نهایی بررسی شوند.",
    icon: HardHat,
    notePlaceholder: "مثلاً درباره تأسیسات، ترک دیوار، رطوبت، مشاعات یا کیفیت بازسازی چه چیزی بررسی شود؟",
  },
  media: {
    deal: "درخواست محتوای جدید",
    title: "عکس و ویدئوی به‌روز",
    description: "از مشاور بخواهید تصاویر جدید، ویدئوی اختصاصی یا نمایی از بخش مشخصی از ملک را برایتان تهیه کند.",
    icon: ImagePlus,
    notePlaceholder: "مثلاً ویدئوی آشپزخانه و پارکینگ یا عکس نورگیری اتاق خواب‌ها را می‌خواهم.",
  },
  legal: {
    deal: "بررسی حقوقی معامله",
    title: "درخواست بررسی قرارداد و مدارک",
    description: "درخواست هماهنگی برای بررسی حقوقی مدارک و متن معامله توسط فرد متخصص، پیش از امضای نهایی.",
    icon: Scale,
    notePlaceholder: "مثلاً قولنامه، سند، وکالت‌نامه یا شرایط خاص قرارداد را بررسی کنید.",
  },
};

function normalizePhone(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/\D/g, "");
}

export function PropertyExpertRequests({ property }: { property: Property }) {
  const [selected, setSelected] = useState<RequestKind | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const meta = selected ? REQUESTS[selected] : null;

  function open(kind: RequestKind) {
    setSelected(kind);
    setNote("");
    trackAnalyticsEvent("property_expert_request", property.slug);
  }

  function close() {
    if (busy) return;
    setSelected(null);
    setNote("");
  }

  async function submit() {
    if (!meta || busy) return;
    const cleanName = name.trim();
    const cleanPhone = normalizePhone(phone);
    if (cleanName.length < 2) {
      toast.error("نام و نام خانوادگی را وارد کنید.");
      return;
    }
    if (!/^09\d{9}$/.test(cleanPhone)) {
      toast.error("شماره موبایل معتبر نیست.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          phone: cleanPhone,
          deal: meta.deal,
          propertyId: property.id,
          propertyType: property.propertyType,
          neighborhood: property.neighborhood,
          consultant: property.contactName,
          note: note.trim() || meta.title,
        }),
      });
      const payload = await response.json().catch(() => null) as {
        trackingToken?: string;
        statusMessage?: string;
        message?: string;
      };
      if (!response.ok) {
        throw new Error(payload?.statusMessage || payload?.message || "ثبت درخواست انجام نشد.");
      }

      toast.success(
        payload?.trackingToken
          ? "درخواست شما ثبت شد. کد پیگیری: " + payload.trackingToken
          : "درخواست شما برای بررسی تیم هیرمند ثبت شد.",
      );
      setName("");
      setPhone("");
      setNote("");
      setSelected(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت درخواست انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="property-expert-requests" aria-labelledby="property-expert-requests-title">
      <header className="property-expert-requests-head">
        <div>
          <span className="kicker">سرویس‌های تخصصی هیرمند</span>
          <h2 id="property-expert-requests-title">فقط اطلاعات نمی‌خواهید؛ بررسی تخصصی هم می‌خواهید؟</h2>
          <p>درخواست را مستقیم روی همین فایل ثبت کنید تا در CRM به مشاور مسئول فایل ارجاع شود.</p>
        </div>
        <span className="property-expert-requests-badge">
          <ShieldCheck size={15} aria-hidden="true" />
          اتصال مستقیم به پیگیری هیرمند
        </span>
      </header>

      <div className="property-expert-request-grid">
        {(Object.entries(REQUESTS) as Array<[RequestKind, RequestMeta]>).map(([kind, item]) => {
          const Icon = item.icon;
          return (
            <article className="property-expert-request-card" key={kind}>
              <div className="property-expert-request-icon" aria-hidden="true">
                <Icon size={20} />
              </div>
              <div className="property-expert-request-copy">
                <h3>{item.title}</h3>
                <p>{item.description}</p>
              </div>
              <button type="button" className="btn-gold" onClick={() => open(kind)}>
                <Send size={15} aria-hidden="true" />
                ثبت درخواست
              </button>
            </article>
          );
        })}
      </div>

      <div className="property-expert-request-note">
        <CheckCircle2 size={15} aria-hidden="true" />
        <span>این درخواست‌ها به معنی تأیید سلامت ملک، صدور نظر حقوقی قطعی یا تضمین نتیجه معامله نیستند؛ نتیجه بررسی در اختیار کارشناس و شرایط واقعی فایل است.</span>
      </div>

      {meta ? (
        <div className="property-expert-request-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}>
          <section className="property-expert-request-dialog" role="dialog" aria-modal="true" aria-labelledby="property-expert-request-dialog-title">
            <button type="button" className="property-expert-request-close" onClick={close} disabled={busy} aria-label="بستن">
              <X size={18} aria-hidden="true" />
            </button>

            <div className="property-expert-request-dialog-head">
              <FileText size={22} aria-hidden="true" />
              <div>
                <span className="kicker">ثبت درخواست تخصصی</span>
                <h3 id="property-expert-request-dialog-title">{meta.title}</h3>
                <p>فایل: {property.title}</p>
              </div>
            </div>

            <div className="property-expert-request-form">
              <label className="field">
                <span>نام و نام خانوادگی</span>
                <input value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} maxLength={80} autoComplete="name" />
              </label>

              <label className="field">
                <span>شماره موبایل</span>
                <input value={phone} onChange={(event) => setPhone(event.target.value.slice(0, 14))} maxLength={14} inputMode="tel" autoComplete="tel" dir="ltr" placeholder="0912..." />
              </label>

              <label className="field">
                <span>توضیحات درخواست</span>
                <textarea value={note} onChange={(event) => setNote(event.target.value.slice(0, 1000))} rows={4} maxLength={1000} placeholder={meta.notePlaceholder} />
                <small>{note.length.toLocaleString("fa-IR")} / ۱۰۰۰</small>
              </label>
            </div>

            <div className="property-expert-request-dialog-actions">
              <button type="button" className="btn-ghost" onClick={close} disabled={busy}>انصراف</button>
              <button type="button" className="btn-gold" onClick={() => void submit()} disabled={busy}>
                {busy ? <Loader2 size={16} className="spin" aria-hidden="true" /> : <Send size={16} aria-hidden="true" />}
                {busy ? "در حال ثبت…" : "ثبت و ارسال به هیرمند"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
