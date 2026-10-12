import { useEffect, useMemo, useState } from "react";
import { SlidersHorizontal, Star } from "lucide-react";
import type { Property } from "@/lib/properties";
import "@/favorite-weighted-matrix.css";

const SCORE_KEY = "hirmand-property-personal-score-v1:";
const WEIGHT_KEY = "hirmand-favorite-score-weights-v1";
const CRITERIA = [
  { key: "location", label: "محله و دسترسی" },
  { key: "price", label: "تناسب قیمت" },
  { key: "condition", label: "وضعیت و کیفیت" },
  { key: "layout", label: "نقشه و کاربرد" },
  { key: "future", label: "چشم‌انداز استفاده" },
] as const;
type Criterion = (typeof CRITERIA)[number]["key"];
type Weights = Record<Criterion, number>;

function readScores(id: string): Record<Criterion, number> | null {
  try {
    const raw = localStorage.getItem(SCORE_KEY + id);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed?.scores || typeof parsed.scores !== "object") return null;
    const values = {} as Record<Criterion, number>;
    for (const item of CRITERIA) {
      const value = Number(parsed.scores[item.key]);
      if (!Number.isFinite(value)) return null;
      values[item.key] = Math.max(1, Math.min(5, value));
    }
    return values;
  } catch {
    return null;
  }
}

function readWeights(): Weights {
  try {
    const raw = localStorage.getItem(WEIGHT_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return { location: 3, price: 3, condition: 3, layout: 3, future: 3 };
    return {
      location: Math.max(1, Math.min(5, Number(parsed.location) || 3)),
      price: Math.max(1, Math.min(5, Number(parsed.price) || 3)),
      condition: Math.max(1, Math.min(5, Number(parsed.condition) || 3)),
      layout: Math.max(1, Math.min(5, Number(parsed.layout) || 3)),
      future: Math.max(1, Math.min(5, Number(parsed.future) || 3)),
    };
  } catch {
    return { location: 3, price: 3, condition: 3, layout: 3, future: 3 };
  }
}

export function FavoriteWeightedMatrix({ properties }: { properties: Property[] }) {
  const [weights, setWeights] = useState<Weights>(() => readWeights());
  const [selected, setSelected] = useState<string[]>([]);
  const [scores, setScores] = useState<Record<string, Record<Criterion, number>>>({});

  useEffect(() => {
    const next: Record<string, Record<Criterion, number>> = {};
    for (const property of properties) {
      const score = readScores(property.id);
      if (score) next[property.id] = score;
    }
    setScores(next);
    setSelected(properties.filter((property) => next[property.id]).slice(0, 5).map((property) => property.id));
  }, [properties]);

  useEffect(() => {
    try { localStorage.setItem(WEIGHT_KEY, JSON.stringify(weights)); } catch { /* optional */ }
  }, [weights]);

  const totalWeight = Object.values(weights).reduce((sum, value) => sum + value, 0);
  const rows = useMemo(() => selected.map((id) => {
    const property = properties.find((item) => item.id === id);
    const score = scores[id];
    if (!property || !score) return null;
    const weighted = CRITERIA.reduce((sum, item) => sum + score[item.key] * weights[item.key], 0) / totalWeight;
    return { property, score, weighted };
  }).filter((item): item is { property: Property; score: Record<Criterion, number>; weighted: number } => Boolean(item)), [properties, scores, selected, totalWeight, weights]);

  function setWeight(key: Criterion, value: number) {
    setWeights((current) => ({ ...current, [key]: value }));
  }

  function toggle(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : current.length >= 5 ? current : [...current, id]);
  }

  const scored = properties.filter((property) => Boolean(scores[property.id]));
  if (!scored.length) return null;

  return (
    <section className="favorite-weighted-matrix" aria-labelledby="favorite-weighted-title">
      <header className="favorite-weighted-head">
        <div>
          <span className="kicker">تصمیم شخصی</span>
          <h2 id="favorite-weighted-title"><SlidersHorizontal size={19} /> ماتریس وزن‌دهی فایل‌های منتخب</h2>
          <p>وزن هر معیار را خودتان تعیین می‌کنید؛ نتیجه فقط محاسبه امتیازهای شخصی ثبت‌شده شماست و ارزش‌گذاری کارشناسی ملک نیست.</p>
        </div>
        <SlidersHorizontal size={21} />
      </header>

      <div className="favorite-weighted-weights">
        {CRITERIA.map((item) => (
          <label key={item.key}><span>{item.label}</span><input type="range" min="1" max="5" value={weights[item.key]} onChange={(e) => setWeight(item.key, Number(e.target.value))} /><b>{weights[item.key]}</b></label>
        ))}
      </div>

      <div className="favorite-weighted-picks">
        {scored.map((property) => (
          <button key={property.id} type="button" className={selected.includes(property.id) ? "is-selected" : ""} onClick={() => toggle(property.id)}>
            {property.title}
          </button>
        ))}
      </div>

      <div className="favorite-weighted-results">
        {rows.map((row) => (
          <article key={row.property.id} className="favorite-weighted-row">
            <div><strong>{row.property.title}</strong><span>{row.property.neighborhood}</span></div>
            <strong className="favorite-weighted-score"><Star size={13} fill="currentColor" /> {row.weighted.toLocaleString("fa-IR", { maximumFractionDigits: 2 })} / ۵</strong>
            <div className="favorite-weighted-bars">
              {CRITERIA.map((item) => <span key={item.key} title={item.label} style={{ width: (row.score[item.key] / 5 * 100) + "%" }} />)}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
