import { useEffect, useMemo, useState } from "react";
import { BarChart3, Check, Star } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/favorites-personal.css";

const KEY = "hirmand-property-personal-score-v1:";
const CRITERIA = [
  { key: "location", label: "محله و دسترسی" },
  { key: "price", label: "تناسب قیمت با بودجه" },
  { key: "condition", label: "وضعیت و کیفیت ملک" },
  { key: "layout", label: "نقشه و کاربردپذیری" },
  { key: "future", label: "چشم‌انداز استفاده/فروش" },
] as const;
type Key = (typeof CRITERIA)[number]["key"];
type Scores = Record<Key, number>;

function readScore(id: string): Scores | null {
  try {
    const raw = localStorage.getItem(KEY + id);
    const data = raw ? JSON.parse(raw) : null;
    if (!data?.scores || typeof data.scores !== "object") return null;
    const result = {} as Scores;
    for (const { key } of CRITERIA) {
      const value = Number((data.scores as Record<string, unknown>)[key]);
      if (!Number.isFinite(value)) return null;
      result[key] = Math.max(1, Math.min(5, value));
    }
    return result;
  } catch {
    return null;
  }
}

export function FavoriteScoreCompare({ properties }: { properties: Property[] }) {
  const [scores, setScores] = useState<Record<string, Scores>>({});
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const next: Record<string, Scores> = {};
    for (const property of properties) {
      const score = readScore(property.id);
      if (score) next[property.id] = score;
    }
    setScores(next);
    setSelected(properties.filter((property) => next[property.id]).slice(0, 4).map((property) => property.id));
  }, [properties]);

  const rows = useMemo(() => selected.map((id) => {
    const property = properties.find((item) => item.id === id);
    return property ? { property, score: scores[id] } : null;
  }).filter((row): row is { property: Property; score: Scores } => Boolean(row)), [properties, scores, selected]);

  function toggle(id: string) {
    setSelected((current) => current.includes(id)
      ? current.filter((item) => item !== id)
      : current.length >= 5 ? current : [...current, id]);
  }

  const scoredProperties = properties.filter((property) => Boolean(scores[property.id]));

  if (!scoredProperties.length) {
    return (
      <section className="favorites-score-compare" aria-label="مقایسه امتیاز شخصی">
        <div className="favorites-score-empty"><BarChart3 size={20} /><strong>مقایسه امتیاز شخصی آماده است</strong><span>ابتدا برای فایل‌های موردنظرتان امتیاز شخصی ثبت کنید تا مقایسه آن‌ها در اینجا نمایش داده شود.</span></div>
      </section>
    );
  }

  return (
    <section className="favorites-score-compare" aria-labelledby="favorites-score-compare-title">
      <header className="favorites-score-compare-head">
        <div><span className="kicker">مقایسه شخصی</span><h2 id="favorites-score-compare-title"><BarChart3 size={19} /> مقایسه امتیاز فایل‌های منتخب</h2><p>این جدول فقط امتیازهای ثبت‌شده توسط خود شما را کنار هم می‌گذارد؛ رتبه‌بندی عمومی ملک نیست.</p></div>
        <span className="favorites-score-limit">حداکثر ۵ فایل</span>
      </header>
      <div className="favorites-score-selects">
        {scoredProperties.map((property) => (
          <button key={property.id} type="button" className={selected.includes(property.id) ? "is-selected" : ""} onClick={() => toggle(property.id)}>
            {selected.includes(property.id) ? <Check size={14} /> : null}
            {property.title}
          </button>
        ))}
      </div>
      {rows.length ? (
        <div className="favorites-score-table-wrap">
          <table className="favorites-score-table">
            <thead><tr><th>معیار</th>{rows.map(({ property, score }) => <th key={property.id}>{property.title}<small>{(CRITERIA.reduce((sum, item) => sum + score[item.key], 0) / CRITERIA.length).toFixed(1)} / ۵</small></th>)}</tr></thead>
            <tbody>{CRITERIA.map(({ key, label }) => <tr key={key}><th>{label}</th>{rows.map(({ property, score }) => <td key={property.id}>{score[key].toLocaleString("fa-IR")} <Star size={12} fill="currentColor" /></td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : <p className="favorites-score-empty">حداقل یک فایل را انتخاب کنید.</p>}
    </section>
  );
}
