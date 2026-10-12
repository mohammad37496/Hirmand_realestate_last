import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ClipboardCheck, RotateCcw } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-visit-checklist.css";

const CHECKS = [
  "وضعیت سند و مدارک پایه بررسی شد",
  "پارکینگ و مسیر ورود خودرو بررسی شد",
  "آسانسور، راه‌پله و مشاعات بررسی شد",
  "نورگیری، صدا و تهویه در زمان بازدید بررسی شد",
  "اتاق‌ها و ابعاد واقعی با نیاز من تطبیق دارد",
  "آثار نم، ترک، خرابی یا تعمیرات مهم بررسی شد",
  "شارژ و هزینه‌های ساختمان سؤال شد",
  "زمان تخلیه/تحویل و شرایط پرداخت روشن شد",
  "دسترسی محله و مسیرهای روزمره بررسی شد",
  "سؤال‌های باز از مالک/مشاور ثبت و پاسخ داده شد",
] as const;

const STORAGE_PREFIX = "hirmand-property-visit-checklist-v1:";

export function PropertyVisitChecklist({ property }: { property: Property }) {
  const key = STORAGE_PREFIX + property.id;
  const [checked, setChecked] = useState<boolean[]>(() => CHECKS.map(() => false));

  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      if (Array.isArray(parsed)) {
        setChecked(CHECKS.map((_, index) => Boolean(parsed[index])));
      }
    } catch {
      // Keep the clean initial checklist when browser storage is unavailable.
    }
  }, [key]);

  const done = useMemo(() => checked.filter(Boolean).length, [checked]);
  const percent = Math.round((done / CHECKS.length) * 100);

  function toggle(index: number) {
    setChecked((current) => {
      const next = current.map((value, itemIndex) => itemIndex === index ? !value : value);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // Checklist still works in-memory when storage is blocked.
      }
      return next;
    });
  }

  function reset() {
    const next = CHECKS.map(() => false);
    setChecked(next);
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
  }

  return (
    <section className="property-visit-checklist" aria-labelledby="property-visit-checklist-title">
      <header className="property-visit-checklist-head">
        <div>
          <span className="kicker">بازدید هوشمند</span>
          <h2 id="property-visit-checklist-title"><ClipboardCheck size={20} /> چک‌لیست بازدید این فایل</h2>
          <p>موارد انجام‌شده برای همین ملک در مرورگر شما ذخیره می‌شوند.</p>
        </div>
        <div className="property-visit-progress" aria-live="polite">
          <strong>{percent.toLocaleString("fa-IR")}٪</strong>
          <span>{done.toLocaleString("fa-IR")} از {CHECKS.length.toLocaleString("fa-IR")}</span>
        </div>
      </header>
      <div className="property-visit-progress-bar"><span style={{ width: percent + "%" }} /></div>
      <div className="property-visit-list">
        {CHECKS.map((item, index) => (
          <label key={item} className={"property-visit-check" + (checked[index] ? " is-done" : "")}>
            <input type="checkbox" checked={checked[index]} onChange={() => toggle(index)} />
            <span className="property-visit-check-icon">{checked[index] ? <CheckCircle2 size={17} /> : null}</span>
            <span>{item}</span>
          </label>
        ))}
      </div>
      {done ? (
        <button type="button" className="property-visit-reset" onClick={reset}>
          <RotateCcw size={14} /> شروع دوباره چک‌لیست
        </button>
      ) : null}
    </section>
  );
}
