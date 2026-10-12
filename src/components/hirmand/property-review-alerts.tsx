import { useMemo } from "react";
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3 } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-review-tools.css";

type ReviewItem = { level: "high" | "medium" | "low"; stage: string; text: string };

export function PropertyReviewAlerts({ property }: { property: Property }) {
  const items = useMemo<ReviewItem[]>(() => {
    const list: ReviewItem[] = [];
    const date = new Date(property.updatedAt).getTime();
    const age = Number.isFinite(date) ? Math.max(0, Math.floor((Date.now() - date) / 86_400_000)) : null;
    if (!property.price && !property.deposit && !property.rent) list.push({ level: "high", stage: "قبل از تماس", text: "هیچ مبلغ عددی برای فایل ثبت نشده است؛ قیمت/ودیعه/اجاره را از مشاور تأیید کنید." });
    if (!property.neighborhood.trim()) list.push({ level: "medium", stage: "قبل از بازدید", text: "محله در اطلاعات فایل مشخص نیست؛ محدوده دقیق را تأیید کنید." });
    if (property.latitude == null || property.longitude == null) list.push({ level: "low", stage: "قبل از بازدید", text: "مختصات دقیق ثبت نشده است؛ آدرس یا موقعیت تقریبی را از مشاور بگیرید." });
    if (property.bedrooms == null || property.bathrooms == null) list.push({ level: "medium", stage: "قبل از بازدید", text: "تعداد اتاق خواب یا سرویس بهداشتی ثبت نشده است؛ اطلاعات واقعی را تأیید کنید." });
    if (!property.parking) list.push({ level: "low", stage: "قبل از بازدید", text: "پارکینگ در فایل ثبت نشده؛ اختصاصی/مزاحم/مشاع بودن آن را حضوری بررسی کنید." });
    if (age != null && age >= 30) list.push({ level: "medium", stage: "قبل از تصمیم", text: "آخرین بروزرسانی فایل حدود " + age.toLocaleString("fa-IR") + " روز پیش بوده است؛ موجودی و قیمت فعلی را دوباره تأیید کنید." });
    if (property.transactionType === "buy" && property.description.trim().length < 40) list.push({ level: "medium", stage: "قبل از بازدید", text: "توضیح کافی درباره ملک ثبت نشده است؛ درباره تعمیرات، شرایط تحویل و محدودیت‌ها سؤال کنید." });
    return list;
  }, [property]);
  const counts = { high: items.filter((item) => item.level === "high").length, medium: items.filter((item) => item.level === "medium").length, low: items.filter((item) => item.level === "low").length };
  return (
    <section className="property-review-alerts" aria-labelledby="property-review-alerts-title">
      <header className="property-review-head">
        <div><span className="kicker">کنترل قبل از تصمیم</span><h2 id="property-review-alerts-title"><ClipboardList size={20} /> مواردی که بهتر است دوباره بررسی شوند</h2><p>این بخش «ریسک قطعی» اعلام نمی‌کند؛ فقط بر اساس داده‌های فایل، سؤال‌ها و بررسی‌های مهم را اولویت‌بندی می‌کند.</p></div>
        <div className="property-review-counts">
          {counts.high ? <span className="is-high">بالا {counts.high.toLocaleString("fa-IR")}</span> : null}
          {counts.medium ? <span className="is-medium">متوسط {counts.medium.toLocaleString("fa-IR")}</span> : null}
          {counts.low ? <span className="is-low">کم {counts.low.toLocaleString("fa-IR")}</span> : null}
        </div>
      </header>
      {items.length ? <div className="property-review-list">{items.map((item) => <article key={item.stage + item.text} className={"property-review-item is-" + item.level}><span className="property-review-icon">{item.level === "high" ? <AlertTriangle size={16} /> : item.level === "medium" ? <Clock3 size={16} /> : <ClipboardList size={16} />}</span><div><strong>{item.stage}</strong><p>{item.text}</p></div></article>)}</div> : <div className="property-review-clean"><CheckCircle2 size={18} /> در داده‌های فعلی این فایل مورد ویژه‌ای برای پیگیری خودکار پیدا نشد؛ بررسی حضوری و قراردادی همچنان ضروری است.</div>}
    </section>
  );
}