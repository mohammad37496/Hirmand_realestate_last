import { useMemo, useState } from "react";
import { Check, Copy, MessageCircle, Send } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import { SITE } from "@/lib/site";
import { toast } from "sonner";
import "@/property-deal-execution.css";

function amount(value: string | null | undefined) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function PropertyOfferMessage({ property }: { property: Property }) {
  const price = amount(property.price);
  const [discountPercent, setDiscountPercent] = useState(5);
  const [conditions, setConditions] = useState("بازدید و بررسی مدارک ملک، سپس توافق نهایی.");
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const offer = Math.max(0, Math.round(price * (1 - discountPercent / 100)));

  const message = useMemo(() => {
    if (!price) return "";
    return [
      `سلام، درباره فایل «${property.title}» از سایت هیرمند پیام می‌دهم.`,
      `قیمت اعلامی: ${formatToman(price)} تومان`,
      `پیشنهاد من: ${formatToman(offer)} تومان (${discountPercent.toLocaleString("fa-IR")}% پایین‌تر از قیمت اعلامی)`,
      conditions.trim() ? `شرایط پیشنهادی: ${conditions.trim()}` : "",
      "در صورت قابل‌بررسی بودن، لطفاً امکان مذاکره و زمان مناسب تماس/بازدید را اعلام بفرمایید.",
    ].filter(Boolean).join("\n");
  }, [conditions, discountPercent, offer, price, property.title]);

  async function copyMessage() {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      toast.success("متن پیشنهاد کپی شد.");
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      toast.error("کپی متن انجام نشد.");
    }
  }

  function openWhatsApp() {
    if (!message) return;
    window.open(`${SITE.whatsappDirect}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }
  async function submitOffer() {
    const mobile = phone
      .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
      .replace(/\D/g, "");
    setSubmitError("");
    if (name.trim().length < 2) return setSubmitError("نام و نام خانوادگی را وارد کنید.");
    if (!/^09\d{9}$/.test(mobile)) return setSubmitError("شماره موبایل معتبر وارد کنید.");
    if (!offer) return setSubmitError("مبلغ پیشنهاد معتبر نیست.");
    setSubmitting(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          phone: mobile,
          peopleCount: 1,
          job: "",
          deal: "پیشنهاد قیمت",
          propertyType: property.propertyType,
          neighborhood: property.neighborhood,
          consultant: property.contactName || "",
          note: "پیشنهاد آنلاین برای فایل «" + property.title + "»",
          source: "website",
          propertyId: property.id,
          offerAmount: offer,
          offerConditions: conditions.trim(),
          matches: [],
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.success) throw new Error(payload?.statusMessage || payload?.message || "ثبت پیشنهاد انجام نشد.");
      setSubmitted(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "ثبت پیشنهاد انجام نشد.");
    } finally {
      setSubmitting(false);
    }
  }


  return (
    <section className="property-deal-tool" aria-labelledby="property-offer-message-title">
      <header className="property-deal-tool-head">
        <div>
          <span className="kicker">مذاکره آماده ارسال</span>
          <h2 id="property-offer-message-title"><MessageCircle size={20} /> پیام پیشنهادی برای مذاکره</h2>
          <p>یک متن آماده بر اساس سناریوی شما می‌سازیم؛ این متن فقط پیشنهاد شخصی شماست و وعده تخفیف از طرف مالک نیست.</p>
        </div>
      </header>
      {price > 0 ? (
        <div className="property-deal-grid">
          <div className="property-deal-controls">
            <label className="property-deal-field">
              <span>تخفیف هدف: {discountPercent.toLocaleString("fa-IR")}٪</span>
              <input type="range" min="0" max="20" step="1" value={discountPercent} onChange={(e) => setDiscountPercent(Number(e.target.value))} />
            </label>
            <div className="property-deal-summary">
              <span>قیمت پیشنهادی</span>
              <strong>{formatToman(offer)} تومان</strong>
            </div>
            <label className="property-deal-field">
              <span>شرایط پیشنهادی</span>
              <textarea maxLength={280} rows={4} value={conditions} onChange={(e) => setConditions(e.target.value)} />
            </label>
          </div>
          <div className="property-offer-preview">
            <div className="property-offer-preview-head"><span>پیش‌نمایش پیام</span><b>{message.length.toLocaleString("fa-IR")} کاراکتر</b></div>
            <pre>{message}</pre>
                        <div className="property-offer-submit">
              <div><strong>ثبت مستقیم پیشنهاد برای هیرمند</strong><span>پیشنهاد شما به‌صورت یک درخواست CRM برای بررسی مشاور ثبت می‌شود.</span></div>
              {submitted ? <div className="property-offer-submitted">✓ پیشنهاد شما ثبت شد؛ مشاور هیرمند آن را بررسی می‌کند.</div> : (
                <>
                  <div className="property-offer-submit-grid">
                    <label><span>نام</span><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>
                    <label><span>موبایل</span><input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" dir="ltr" placeholder="0912..." /></label>
                  </div>
                  {submitError ? <p className="property-offer-submit-error" role="alert">{submitError}</p> : null}
                  <button type="button" className="property-deal-btn property-deal-btn-primary" onClick={() => void submitOffer()} disabled={submitting}>
                    {submitting ? "در حال ثبت…" : "ثبت پیشنهاد در هیرمند"}
                  </button>
                </>
              )}
            </div>\n            <div className="property-deal-actions">
              <button type="button" className="property-deal-btn" onClick={() => void copyMessage()}>
                {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "کپی شد" : "کپی متن"}
              </button>
              <button type="button" className="property-deal-btn property-deal-btn-primary" onClick={openWhatsApp}>
                <Send size={16} /> ارسال در واتساپ
              </button>
            </div>
          </div>
        </div>
      ) : (
        <p className="property-deal-empty">برای ساخت پیام پیشنهادی، قیمت فروش عددی این فایل باید ثبت شده باشد.</p>
      )}
    </section>
  );
}
