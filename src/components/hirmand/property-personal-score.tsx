import { useEffect, useMemo, useState } from "react";
import { RotateCcw, Star } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/property-scenario-tools.css";

const CRITERIA = [
  { key: "location", label: "محله و دسترسی" },
  { key: "price", label: "تناسب قیمت با بودجه" },
  { key: "condition", label: "وضعیت و کیفیت ملک" },
  { key: "layout", label: "نقشه و کاربردپذیری" },
  { key: "future", label: "چشم‌انداز استفاده/فروش" },
] as const;
type Scores = Record<(typeof CRITERIA)[number]["key"], number>;
const DEFAULT: Scores = { location: 3, price: 3, condition: 3, layout: 3, future: 3 };
const KEY = "hirmand-property-personal-score-v1:";

export function PropertyPersonalScore({ property }: { property: Property }) {
  const [scores, setScores] = useState<Scores>(DEFAULT);
  const [note, setNote] = useState("");

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY + property.id);
      const data = raw ? JSON.parse(raw) : null;
      if (data?.scores && typeof data.scores === "object") {
        setScores({ ...DEFAULT, ...Object.fromEntries(CRITERIA.map(({ key }) => [key, Number(data.scores[key]) || 3])) } as Scores);
      }
      if (typeof data?.note === "string") setNote(data.note.slice(0, 500));
    } catch {
      // Keep default scores when browser storage is unavailable.
    }
  }, [property.id]);

  useEffect(() => {
    try {
      localStorage.setItem(KEY + property.id, JSON.stringify({ scores, note }));
    } catch {
      // Keep the score usable in memory when storage is blocked.
    }
  }, [note, property.id, scores]);

  const average = useMemo(() => {
    const values = CRITERIA.map(({ key }) => scores[key]);
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [scores]);

  function setScore(key: Scores[keyof Scores] extends number ? keyof Scores : never, value: number) {
    setScores((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setScores(DEFAULT);
    setNote("");
    try { localStorage.removeItem(KEY + property.id); } catch { /* memory reset still works */ }
  }

  return (
    <section className="property-score-tool" aria-labelledby="property-personal-score-title">
      <header className="property-score-head">
        <div>
          <span className="kicker">تصمیم شخصی</span>
          <h2 id="property-personal-score-title"><Star size={20} /> امتیاز شخصی این ملک</h2>
          <p>این امتیاز فقط بر اساس معیارهای خود شماست و نباید با ارزش‌گذاری کارشناسی یا رتبه‌بندی عمومی اشتباه گرفته شود.</p>
        </div>
        <div className="property-score-total"><strong>{average.toFixed(1)}</strong><span>از ۵</span></div>
      </header>
      <div className="property-score-list">
        {CRITERIA.map(({ key, label }) => (
          <div className="property-score-row" key={key}>
            <span>{label}</span>
            <div className="property-score-stars" role="group" aria-label={label}>
              {[1, 2, 3, 4, 5].map((value) => (
                <button key={value} type="button" className={value <= scores[key] ? "is-on" : ""} aria-label={value + " از ۵"} onClick={() => setScore(key, value)}>
                  <Star size={17} fill="currentColor" />
                </button>
              ))}
            </div>
            <strong>{scores[key].toLocaleString("fa-IR")}/۵</strong>
          </div>
        ))}
      </div>
      <label className="property-score-note">
        <span>یادداشت تصمیم</span>
        <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً چرا این فایل برای من جذاب است یا چه نکته‌ای هنوز حل نشده..." />
      </label>
      <button type="button" className="property-score-reset" onClick={reset}><RotateCcw size={14} /> پاک‌کردن امتیاز شخصی</button>
    </section>
  );
}
