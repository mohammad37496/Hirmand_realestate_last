import { useMemo, useState } from "react";
import { Banknote, Calculator, CheckCircle2, Send } from "lucide-react";
import { toast } from "sonner";
import type { Property } from "@/lib/properties";

function normalizeDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/\D/g, "");
}

function amount(value: string) {
  const clean = normalizeDigits(value).replace(/[,٬،\s]/g, "");
  const parsed = Number(clean);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : 0;
}

function money(value: number) {
  return value.toLocaleString("fa-IR") + " تومان";
}

export function PropertyFinancingRequest({ property }: { property: Property }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [downPayment, setDownPayment] = useState("");
  const [monthlyLimit, setMonthlyLimit] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [trackingToken, setTrackingToken] = useState("");

  const price = useMemo(() => amount(property.price ?? ""), [property.price]);
  const down = amount(downPayment);
  const limit = amount(monthlyLimit);
  const requestedFinance = Math.max(0, price - down);

  async function submit() {
    const normalizedPhone = normalizeDigits(phone);
    if (name.trim().length < 2) {
      toast.error("نام و نام خانوادگی را وارد کنید.");
      return;
    }
    if (!/^09\d{9}$/.test(normalizedPhone)) {
      toast.error("شماره موبایل معتبر وارد کنید.");
      return;
    }
    if (!down || (price > 0 && down >= price)) {
      toast.error("مبلغ آورده اولیه را متناسب با قیمت فایل وارد کنید.");
      return;
    }
    if (!limit) {
      toast.error("حداکثر قسط ماهانه را وارد کنید.");
      return;
    }

    setBusy(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: normalizedPhone,
          peopleCount: 1,
          job: "",
          deal: "درخواست تأمین مالی",
          propertyType: property.propertyType,
          neighborhood: property.neighborhood,
          floorPreference: "",
          consultant: property.contactName || "",
          note: [
            "درخواست بررسی تأمین مالی برای فایل: " + property.title,
            "قیمت فایل: " + (price ? money(price) : "ثبت نشده"),
            "آورده اولیه مشتری: " + money(down),
            "مبلغ موردنیاز تقریبی: " + (requestedFinance ? money(requestedFinance) : "قابل محاسبه نیست"),
            "حداکثر قسط ماهانه موردنظر: " + money(limit),
            note.trim() ? "یادداشت: " + note.trim() : "",
          ].filter(Boolean).join("\n"),
          source: "website",
          propertyId: property.id,
          matches: [],
        }),
      });
      const payload = await response.json().catch(() => null) as { success?: boolean; trackingToken?: string; statusMessage?: string; message?: string } | null;
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.statusMessage || payload?.message || "ثبت درخواست تأمین مالی انجام نشد.");
      }
      setTrackingToken(payload.trackingToken || "");
      setDone(true);
      toast.success("درخواست بررسی تأمین مالی ثبت شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت درخواست انجام نشد.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id="property-financing-request" className="property-new-feature property-financing-request" aria-labelledby="property-financing-request-title">
      <header className="property-new-feature-head">
        <div>
          <span className="kicker"><Banknote size={14} /> مسیر تأمین مالی</span>
          <h2 id="property-financing-request-title">برای خرید این فایل، توان تأمین مالی‌تان را بررسی کنیم</h2>
          <p>آورده و سقف قسط خودتان را ثبت کنید تا درخواست بررسی شرایط مالی برای همین ملک در مرکز پیگیری هیرمند ثبت شود.</p>
        </div>
        <span className="property-new-feature-badge"><Calculator size={13} /> محاسبه سناریو</span>
      </header>

      {done ? (
        <div className="property-financing-success" role="status">
          <span><CheckCircle2 size={24} /></span>
          <div>
            <strong>درخواست شما ثبت شد.</strong>
            <p>مشاور هیرمند اطلاعات فایل و سناریوی مالی شما را بررسی می‌کند.</p>
            <small>کد پیگیری: <bdi dir="ltr">{trackingToken || "—"}</bdi></small>
          </div>
        </div>
      ) : (
        <>
          <div className="property-financing-summary">
            <div><span>قیمت فایل</span><strong>{price ? money(price) : "ثبت نشده"}</strong></div>
            <div><span>آورده شما</span><strong>{down ? money(down) : "—"}</strong></div>
            <div><span>مبلغ موردنیاز تقریبی</span><strong>{price && down ? money(requestedFinance) : "—"}</strong></div>
          </div>
          <div className="property-financing-fields">
            <label><span>نام و نام خانوادگی</span><input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} autoComplete="name" /></label>
            <label><span>شماره موبایل</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" autoComplete="tel" placeholder="0912..." /></label>
            <label><span>آورده اولیه</span><input value={downPayment} onChange={(e) => setDownPayment(e.target.value)} inputMode="numeric" placeholder="مثلاً ۵٬۰۰۰٬۰۰۰٬۰۰۰" /></label>
            <label><span>حداکثر قسط ماهانه</span><input value={monthlyLimit} onChange={(e) => setMonthlyLimit(e.target.value)} inputMode="numeric" placeholder="مثلاً ۵۰٬۰۰۰٬۰۰۰" /></label>
            <label className="property-financing-note-field"><span>یادداشت اختیاری</span><textarea rows={2} value={note} onChange={(e) => setNote(e.target.value.slice(0, 600))} placeholder="مثلاً چه مدت برای بازپرداخت مدنظر دارید؟" /></label>
          </div>
          <button type="button" className="btn-gold" onClick={() => void submit()} disabled={busy}>
            <Send size={16} />
            {busy ? "در حال ثبت…" : "ثبت درخواست بررسی تأمین مالی"}
          </button>
          <small className="property-financing-disclaimer">
            این بخش وعده وام یا تأیید اعتبار نیست؛ فقط درخواست شما را با سناریوی مالی انتخابی به مشاور هیرمند منتقل می‌کند.
          </small>
        </>
      )}
    </section>
  );
}
