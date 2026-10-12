import { useMemo, useState } from "react";
import { CheckCircle2, FileText, Send, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import type { Property } from "@/lib/properties";

type DocumentItem = {
  id: string;
  title: string;
  hint: string;
};

function normalizePhone(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/D/g, "")
    .slice(0, 11);
}

function documentsFor(property: Property): DocumentItem[] {
  if (property.transactionType === "rent") {
    return [
      { id: "authority", title: "مدرک مالکیت یا اختیار قانونی برای اجاره", hint: "برای تطبیق اختیار اجاره‌دهنده" },
      { id: "identity", title: "مدارک هویتی موجر و اطلاعات قابل تطبیق", hint: "برای بررسی اولیه طرف معامله" },
      { id: "finance", title: "مبلغ نهایی رهن و اجاره", hint: "برای تطبیق با شرایط فایل" },
      { id: "handover", title: "شرایط و تاریخ دقیق تحویل", hint: "برای هماهنگی قرارداد" },
      { id: "settlement", title: "وضعیت قبوض و شارژ", hint: "در صورت نیاز" },
    ];
  }

  if (property.transactionType === "mortgage") {
    return [
      { id: "title", title: "مدرک مالکیت و وضعیت رهن فعلی", hint: "برای بررسی اولیه" },
      { id: "identity", title: "مدارک هویتی مالک", hint: "برای تطبیق مشخصات" },
      { id: "finance", title: "مبلغ رهن و شرایط فک یا تسویه", hint: "برای بررسی شرایط معامله" },
      { id: "handover", title: "زمان و شرایط تحویل", hint: "برای برنامه‌ریزی معامله" },
    ];
  }

  return [
    { id: "title", title: "مدرک مالکیت یا سند و مشخصات مالک", hint: "بررسی اولیه مالکیت" },
    { id: "registry", title: "وضعیت رهن، بازداشت و محدودیت‌های ثبتی", hint: "برای هماهنگی استعلام" },
    { id: "building", title: "پایان‌کار، تفکیک و وضعیت پارکینگ در صورت نیاز", hint: "بررسی اولیه مدارک ساختمان" },
    { id: "identity", title: "مدارک هویتی مالک", hint: "برای تطبیق مشخصات" },
    { id: "terms", title: "قیمت نهایی و شرایط پرداخت", hint: "برای هماهنگی معامله" },
    { id: "handover", title: "تاریخ و شرایط تحویل", hint: "برای برنامه‌ریزی معامله" },
  ];
}

export function PropertyDocumentRequest({ property }: { property: Property }) {
  const documents = useMemo(() => documentsFor(property), [property.transactionType]);
  const [selected, setSelected] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [trackingToken, setTrackingToken] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function submit() {
    const cleanName = name.trim();
    const cleanPhone = normalizePhone(phone);
    if (cleanName.length < 2) {
      toast.error("نام و نام خانوادگی را وارد کنید.");
      return;
    }
    if (!/^09\d{9}$/.test(cleanPhone)) {
      toast.error("شماره موبایل معتبر وارد کنید.");
      return;
    }
    if (!selected.length) {
      toast.error("حداقل یک مورد برای بررسی انتخاب کنید.");
      return;
    }

    const selectedTitles = documents.filter((item) => selected.includes(item.id)).map((item) => item.title);
    const requestNote = [
      "درخواست بررسی مدارک و شرایط معامله برای فایل «" + property.title + "»",
      "موارد درخواست‌شده:",
      ...selectedTitles.map((item) => "• " + item),
      note.trim() ? "یادداشت مشتری: " + note.trim() : "",
    ].filter(Boolean).join("\n");

    setBusy(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: cleanName,
          phone: cleanPhone,
          peopleCount: 1,
          job: "",
          deal: "درخواست مدارک",
          propertyType: property.propertyType,
          neighborhood: property.neighborhood,
          floorPreference: "",
          consultant: property.contactName || "",
          note: requestNote,
          source: "website",
          propertyId: property.id,
          matches: [],
        }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; trackingToken?: string; message?: string; statusMessage?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.statusMessage || payload?.message || "ثبت درخواست بررسی مدارک انجام نشد.");
      }
      setTrackingToken(payload.trackingToken || null);
      setSelected([]);
      setNote("");
      toast.success("درخواست بررسی مدارک برای هیرمند ثبت شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت درخواست انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="property-document-request" className="property-new-feature property-document-request" aria-labelledby="property-document-request-title">
      <header className="property-new-feature-head">
        <div>
          <span className="kicker"><FileText size={14} /> بررسی معامله</span>
          <h2 id="property-document-request-title">درخواست بررسی مدارک این فایل</h2>
          <p>موارد موردنیازتان را انتخاب کنید تا درخواست واقعی در مرکز پیگیری هیرمند ثبت شود؛ این بخش جایگزین مشاوره حقوقی نیست.</p>
        </div>
        <span className="property-new-feature-badge"><ShieldCheck size={13} /> ارسال امن فرم</span>
      </header>

      {trackingToken ? (
        <div className="property-document-request-success" role="status">
          <span className="property-document-request-success-icon"><CheckCircle2 size={24} /></span>
          <div>
            <strong>درخواست شما ثبت شد.</strong>
            <p>هیرمند درخواست بررسی موارد انتخابی را دریافت کرد و برای هماهنگی با شما تماس می‌گیرد.</p>
            {trackingToken ? <small>کد پیگیری: <bdi dir="ltr">{trackingToken}</bdi></small> : null}
          </div>
          <button type="button" className="btn-ghost" onClick={() => setTrackingToken(null)}>ثبت درخواست جدید</button>
        </div>
      ) : (
        <>
          <div className="property-document-request-list">
            {documents.map((item) => (
              <label key={item.id} className={selected.includes(item.id) ? "is-selected" : ""}>
                <input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(item.id)} />
                <span className="property-document-request-check"><span /></span>
                <span className="property-document-request-copy">
                  <strong>{item.title}</strong>
                  <small>{item.hint}</small>
                </span>
              </label>
            ))}
          </div>

          <div className="property-document-request-fields">
            <label>
              <span>نام و نام خانوادگی</span>
              <input value={name} onChange={(event) => setName(event.target.value.slice(0, 80))} autoComplete="name" />
            </label>
            <label>
              <span>شماره موبایل</span>
              <input dir="ltr" inputMode="tel" value={phone} onChange={(event) => setPhone(normalizePhone(event.target.value))} autoComplete="tel" placeholder="0912..." />
            </label>
            <label className="property-document-request-note">
              <span>یادداشت اختیاری</span>
              <textarea rows={2} value={note} onChange={(event) => setNote(event.target.value.slice(0, 500))} placeholder="مثلاً درخواست تصویر سند یا هماهنگی استعلام..." />
            </label>
          </div>

          <div className="property-document-request-actions">
            <span>{selected.length.toLocaleString("fa-IR")} مورد انتخاب شده</span>
            <button type="button" className="btn-gold" onClick={() => void submit()} disabled={busy}>
              <Send size={16} />
              {busy ? "در حال ثبت…" : "ثبت درخواست بررسی"}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
