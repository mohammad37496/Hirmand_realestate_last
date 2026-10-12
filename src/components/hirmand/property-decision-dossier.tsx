import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, FileText, Printer, RefreshCw, Star } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import { propertyPath } from "@/lib/property-path";
import "@/property-decision-dossier.css";

const SCORE_KEY = "hirmand-property-personal-score-v1:";
const VISIT_KEY = "hirmand-property-visit-checklist-v1:";
const DEAL_KEY = "hirmand-deal-checklist-v1:";
const NOTE_KEY = "hirmand-visit-report-note-v1:";
const PAYMENT_KEY = "hirmand-payment-plan-v1:";
const REMINDER_KEY = "hirmand-property-reminder-v1:";
const FAVORITE_META_KEY = "hirmand-favorite-meta-v1";

const SCORE_ITEMS = ["location", "price", "condition", "layout", "future"] as const;
const SCORE_LABELS: Record<(typeof SCORE_ITEMS)[number], string> = {
  location: "محله و دسترسی",
  price: "تناسب قیمت",
  condition: "وضعیت و کیفیت",
  layout: "نقشه و کاربرد",
  future: "چشم‌انداز استفاده",
};

type DossierData = {
  scores: Record<string, number> | null;
  scoreNote: string;
  visitDone: number;
  visitTotal: number;
  dealDone: number;
  dealTotal: number;
  visitNote: string;
  payment: Record<string, unknown> | null;
  reminder: Record<string, unknown> | null;
  favoriteTag: string;
  favoriteNote: string;
};

function readJson(key: string, id: string) {
  try {
    const raw = localStorage.getItem(key + id);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function readChecks(key: string, id: string) {
  try {
    const raw = localStorage.getItem(key + id);
    const parsed = raw ? JSON.parse(raw) : null;
    const checks = Array.isArray(parsed) ? parsed : [];
    return {
      done: checks.filter(Boolean).length,
      total: checks.length,
    };
  } catch {
    return { done: 0, total: 0 };
  }
}

function money(value: unknown) {
  if (value == null || value === "") return "";
  const numeric = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(numeric) ? formatToman(numeric) + " تومان" : String(value);
}

function formatDate(value: unknown) {
  if (typeof value !== "string" || !value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "long", day: "numeric" }).format(date);
}

function buildSummary(property: Property, data: DossierData, average: number | null) {
  const scoreText = average == null ? "ثبت نشده" : average.toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " از ۵";
  const priceText = property.price ? money(property.price) : "ثبت نشده";
  const depositText = property.deposit ? money(property.deposit) : "ثبت نشده";
  const rentText = property.rent ? money(property.rent) : "ثبت نشده";
  const checklistText = [
    data.visitTotal ? "بازدید: " + data.visitDone + " از " + data.visitTotal : "",
    data.dealTotal ? "معامله: " + data.dealDone + " از " + data.dealTotal : "",
  ].filter(Boolean).join(" | ") || "هنوز چک‌لیست ذخیره نشده";

  return [
    "پرونده تصمیم شخصی هیرمند",
    "فایل: " + property.title,
    "کد فایل: " + property.id.slice(-6).toUpperCase(),
    "محله: " + property.neighborhood,
    property.areaM2 != null ? "متراژ: " + property.areaM2.toLocaleString("fa-IR") + " متر" : "",
    "قیمت: " + priceText,
    property.transactionType === "rent" ? "رهن: " + depositText + " | اجاره: " + rentText : "",
    "امتیاز شخصی: " + scoreText,
    checklistText,
    data.favoriteTag ? "برچسب منتخب: " + data.favoriteTag : "",
    data.favoriteNote ? "یادداشت سبد: " + data.favoriteNote : "",
    data.visitNote ? "یادداشت بازدید: " + data.visitNote : "",
    data.reminder?.date ? "پیگیری بعدی: " + formatDate(data.reminder.date) + (data.reminder.time ? " ساعت " + String(data.reminder.time) : "") : "",
    propertyPath(property),
  ].filter(Boolean).join("\n");
}

export function PropertyDecisionDossier({ property }: { property: Property }) {
  const [version, setVersion] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const refresh = () => setVersion((value) => value + 1);
    window.addEventListener("storage", refresh);
    return () => window.removeEventListener("storage", refresh);
  }, []);

  const data = useMemo<DossierData>(() => {
    const score = readJson(SCORE_KEY, property.id);
    const scores = score?.scores && typeof score.scores === "object" ? score.scores as Record<string, number> : null;
    const visit = readChecks(VISIT_KEY, property.id);
    const deal = readChecks(DEAL_KEY, property.id);
    const note = readJson(NOTE_KEY, property.id);
    const payment = readJson(PAYMENT_KEY, property.id);
    const reminder = readJson(REMINDER_KEY, property.id);

    let favoriteTag = "";
    let favoriteNote = "";
    try {
      const raw = localStorage.getItem(FAVORITE_META_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const meta = parsed?.[property.slug];
      if (meta && typeof meta === "object") {
        favoriteTag = typeof meta.tag === "string" ? meta.tag : "";
        favoriteNote = typeof meta.note === "string" ? meta.note : "";
      }
    } catch {
      // Optional personal metadata.
    }

    return {
      scores,
      scoreNote: typeof score?.note === "string" ? score.note : "",
      visitDone: visit.done,
      visitTotal: visit.total,
      dealDone: deal.done,
      dealTotal: deal.total,
      visitNote: typeof note?.note === "string" ? note.note : "",
      payment,
      reminder,
      favoriteTag,
      favoriteNote,
    };
  }, [property.id, property.slug, version]);

  const average = useMemo(() => {
    if (!data.scores) return null;
    const values = SCORE_ITEMS.map((key) => Number(data.scores?.[key])).filter((value) => Number.isFinite(value));
    return values.length === SCORE_ITEMS.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }, [data.scores]);

  const summary = useMemo(() => buildSummary(property, data, average), [property, data, average]);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="property-dossier" aria-labelledby="property-dossier-title">
      <header className="property-dossier-head">
        <div>
          <span className="kicker">جمع‌بندی شخصی</span>
          <h2 id="property-dossier-title"><FileText size={19} /> پرونده تصمیم این فایل</h2>
          <p>یک نمای یک‌جا از اطلاعات فعلی فایل و داده‌های شخصی‌ای که در مرورگر برای تصمیم‌گیری ثبت کرده‌اید؛ این برگه توصیه خرید یا ارزیابی حقوقی/کارشناسی نیست.</p>
        </div>
        <div className="property-dossier-actions">
          <button type="button" className="btn-ghost" onClick={() => setVersion((value) => value + 1)}><RefreshCw size={15} /> به‌روزرسانی</button>
          <button type="button" className="btn-ghost" onClick={() => window.print()}><Printer size={15} /> چاپ</button>
          <button type="button" className="btn-gold" onClick={() => void copySummary()}>{copied ? <CheckCircle2 size={15} /> : <Copy size={15} />} {copied ? "کپی شد" : "کپی خلاصه"}</button>
        </div>
      </header>

      <div className="property-dossier-grid">
        <div className="property-dossier-main">
          <div className="property-dossier-facts">
            <div><span>قیمت</span><strong>{property.price ? money(property.price) : "ثبت نشده"}</strong></div>
            {property.transactionType === "rent" ? <div><span>رهن</span><strong>{property.deposit ? money(property.deposit) : "ثبت نشده"}</strong></div> : null}
            {property.transactionType === "rent" ? <div><span>اجاره</span><strong>{property.rent ? money(property.rent) : "ثبت نشده"}</strong></div> : null}
            <div><span>متراژ</span><strong>{property.areaM2 != null ? property.areaM2.toLocaleString("fa-IR") + " متر" : "ثبت نشده"}</strong></div>
            <div><span>خواب</span><strong>{property.bedrooms != null ? property.bedrooms.toLocaleString("fa-IR") : "ثبت نشده"}</strong></div>
            <div><span>وضعیت</span><strong>{property.availabilityStatus === "available" ? "موجود" : property.availabilityStatus === "reserved" ? "رزرو موقت" : property.availabilityStatus === "sold" ? "فروخته‌شده" : property.availabilityStatus === "rented" ? "اجاره‌داده‌شده" : "فعلاً ناموجود"}</strong></div>
          </div>

          <div className="property-dossier-progress">
            <div>
              <span>امتیاز شخصی</span>
              <strong>{average == null ? "ثبت نشده" : average.toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " / ۵"}</strong>
            </div>
            <div>
              <span>چک‌لیست بازدید</span>
              <strong>{data.visitTotal ? data.visitDone.toLocaleString("fa-IR") + " / " + data.visitTotal.toLocaleString("fa-IR") : "ثبت نشده"}</strong>
            </div>
            <div>
              <span>چک‌لیست معامله</span>
              <strong>{data.dealTotal ? data.dealDone.toLocaleString("fa-IR") + " / " + data.dealTotal.toLocaleString("fa-IR") : "ثبت نشده"}</strong>
            </div>
          </div>

          {data.scores ? (
            <div className="property-dossier-score-list">
              {SCORE_ITEMS.map((key) => (
                <div key={key}><span>{SCORE_LABELS[key]}</span><strong><Star size={13} fill="currentColor" /> {Number(data.scores?.[key] ?? 0).toLocaleString("fa-IR")} / ۵</strong></div>
              ))}
            </div>
          ) : null}
        </div>

        <aside className="property-dossier-side">
          {data.favoriteTag || data.favoriteNote ? (
            <div className="property-dossier-note"><b>سبد منتخب</b>{data.favoriteTag ? <span>برچسب: {data.favoriteTag}</span> : null}{data.favoriteNote ? <p>{data.favoriteNote}</p> : null}</div>
          ) : null}
          {data.scoreNote ? <div className="property-dossier-note"><b>یادداشت امتیاز</b><p>{data.scoreNote}</p></div> : null}
          {data.visitNote ? <div className="property-dossier-note"><b>یادداشت بازدید</b><p>{data.visitNote}</p></div> : null}
          {data.payment ? (
            <div className="property-dossier-note">
              <b>برنامه پرداخت</b>
              {data.payment.depositPercent != null ? <span>پیش‌پرداخت: {String(data.payment.depositPercent)}٪</span> : null}
              {data.payment.installments != null ? <span>تعداد اقساط: {String(data.payment.installments)}</span> : null}
              {data.payment.monthlyAmount ? <span>مبلغ قسط: {money(data.payment.monthlyAmount)}</span> : null}
            </div>
          ) : null}
          {data.reminder ? (
            <div className="property-dossier-note">
              <b>پیگیری بعدی</b>
              {data.reminder.date ? <span>{formatDate(data.reminder.date)}</span> : null}
              {data.reminder.time ? <span>ساعت {String(data.reminder.time)}</span> : null}
              {data.reminder.action ? <span>{String(data.reminder.action)}</span> : null}
            </div>
          ) : null}
        </aside>
      </div>
    </section>
  );
}
