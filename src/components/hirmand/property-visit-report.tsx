import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, Copy, Printer, Share2 } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import { propertyPath } from "@/lib/property-path";
import { toast } from "sonner";
import "@/property-inquiry-tools.css";

const VISIT_KEY = "hirmand-property-visit-checklist-v1:";
const DEAL_KEY = "hirmand-deal-checklist-v1:";
const VISIT_ITEMS = [
  "وضعیت سند و مدارک پایه",
  "پارکینگ و مسیر ورود خودرو",
  "آسانسور، راه‌پله و مشاعات",
  "نورگیری، صدا و تهویه",
  "ابعاد اتاق‌ها و تناسب با نیاز",
  "نم، ترک، خرابی و تعمیرات",
  "شارژ و هزینه‌های ساختمان",
  "زمان تحویل و شرایط پرداخت",
  "دسترسی‌های محله",
  "سؤال‌های باز از مالک/مشاور",
];
const DEAL_ITEMS = [
  "تطبیق هویت فروشنده و مشخصات سند",
  "بررسی رهن، بازداشت و بدهی‌های مهم",
  "مکتوب شدن شرایط پرداخت و تعهدات",
  "مشخص شدن مبلغ کمیسیون و نحوه پرداخت",
  "تسویه قبوض و شارژ",
  "صورتجلسه اقلام و امکانات تحویلی",
  "ثبت وضعیت نهایی ملک در زمان تحویل",
  "کنترل مدارک نهایی و مسیر انتقال",
];

function readChecks(key: string, count: number) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.from({ length: count }, (_, index) => Boolean(Array.isArray(parsed) ? parsed[index] : false));
  } catch {
    return Array.from({ length: count }, () => false);
  }
}

function moneyValue(value: string | null | undefined) {
  const n = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? formatToman(n) + " تومان" : "";
}

export function PropertyVisitReport({ property }: { property: Property }) {
  const [visitChecks, setVisitChecks] = useState<boolean[]>(() => VISIT_ITEMS.map(() => false));
  const [dealChecks, setDealChecks] = useState<boolean[]>(() => DEAL_ITEMS.map(() => false));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    setVisitChecks(readChecks(VISIT_KEY + property.id, VISIT_ITEMS.length));
    setDealChecks(readChecks(DEAL_KEY + property.id, DEAL_ITEMS.length));
    try {
      setNotes(localStorage.getItem("hirmand-visit-report-note-v1:" + property.id)?.slice(0, 1500) ?? "");
    } catch {
      // Keep the report usable when browser storage is unavailable.
    }
  }, [property.id]);

  useEffect(() => {
    try {
      localStorage.setItem("hirmand-visit-report-note-v1:" + property.id, notes);
    } catch {
      // Keep the note in memory when storage is blocked.
    }
  }, [notes, property.id]);

  const reportText = useMemo(() => {
    const url = typeof window !== "undefined" ? new URL(propertyPath(property), window.location.origin).toString() : propertyPath(property);
    const visitDone = visitChecks.filter(Boolean).length;
    const dealDone = dealChecks.filter(Boolean).length;
    return [
      `گزارش بازدید فایل هیرمند: ${property.title}`,
      `کد فایل: ${property.id}`,
      property.neighborhood ? `محله: ${property.neighborhood}` : "",
      property.areaM2 ? `متراژ: ${property.areaM2.toLocaleString("fa-IR")} متر` : "",
      moneyValue(property.price) ? `قیمت: ${moneyValue(property.price)}` : "",
      `چک‌لیست بازدید: ${visitDone}/${VISIT_ITEMS.length}`,
      `چک‌لیست معامله: ${dealDone}/${DEAL_ITEMS.length}`,
      "یادداشت شخصی:",
      notes.trim() || "—",
      `لینک فایل: ${url}`,
    ].filter(Boolean).join("\n");
  }, [dealChecks, notes, property, visitChecks]);

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(reportText);
      toast.success("گزارش کپی شد.");
    } catch {
      toast.error("کپی گزارش انجام نشد.");
    }
  }

  async function shareReport() {
    try {
      if (navigator.share) {
        await navigator.share({ title: "گزارش بازدید " + property.title, text: reportText });
      } else {
        await navigator.clipboard.writeText(reportText);
        toast.success("متن گزارش کپی شد.");
      }
    } catch {
      // Sharing can be cancelled by the visitor.
    }
  }

  return (
    <section className="property-visit-report" id="visit-report" aria-labelledby="property-visit-report-title">
      <header className="property-visit-report-head">
        <div>
          <span className="kicker">خروجی بازدید</span>
          <h2 id="property-visit-report-title"><ClipboardCheck size={20} /> گزارش بازدید و تصمیم</h2>
          <p>گزارش از وضعیت فعلی چک‌لیست‌ها و یادداشت شما ساخته می‌شود و جایگزین گزارش کارشناسی یا حقوقی نیست.</p>
        </div>
        <div className="property-visit-report-actions">
          <button type="button" onClick={() => window.print()}><Printer size={16} /> چاپ</button>
          <button type="button" onClick={() => void copyReport()}><Copy size={16} /> کپی گزارش</button>
          <button type="button" onClick={() => void shareReport()}><Share2 size={16} /> اشتراک</button>
        </div>
      </header>
      <div className="property-visit-report-grid">
        <div>
          <strong>{property.title}</strong>
          <span>{property.neighborhood || "محله ثبت نشده"} {property.areaM2 ? " · " + property.areaM2.toLocaleString("fa-IR") + " متر" : ""}</span>
        </div>
        <div>
          <strong>{visitChecks.filter(Boolean).length.toLocaleString("fa-IR")} / {VISIT_ITEMS.length.toLocaleString("fa-IR")}</strong>
          <span>موارد بازدید تکمیل شده</span>
        </div>
        <div>
          <strong>{dealChecks.filter(Boolean).length.toLocaleString("fa-IR")} / {DEAL_ITEMS.length.toLocaleString("fa-IR")}</strong>
          <span>موارد کنترل معامله تکمیل شده</span>
        </div>
      </div>
      <label className="property-visit-report-notes">
        <span>یادداشت بازدید</span>
        <textarea value={notes} maxLength={1500} rows={5} onChange={(event) => setNotes(event.target.value)} placeholder="نکته‌های مهم، ایرادها، پاسخ مالک، وضعیت نورگیری یا هر موردی که برای تصمیم نهایی لازم است..." />
      </label>
      <div className="property-visit-report-check-columns">
        <div><h3>بازدید</h3>{VISIT_ITEMS.map((item, index) => <span key={item} className={visitChecks[index] ? "is-done" : ""}>{visitChecks[index] ? "✓" : "○"} {item}</span>)}</div>
        <div><h3>معامله و تحویل</h3>{DEAL_ITEMS.map((item, index) => <span key={item} className={dealChecks[index] ? "is-done" : ""}>{dealChecks[index] ? "✓" : "○"} {item}</span>)}</div>
      </div>
      <div className="property-visit-report-footer">گزارش کاربر · صرفاً برای نظم دادن به اطلاعات فایل</div>
    </section>
  );
}
