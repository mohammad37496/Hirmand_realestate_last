import { useMemo, useState } from "react";
import { BarChart3, Minus, Plus, RefreshCcw } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import "@/property-scenario-tools.css";

function numeric(value: string | null | undefined) {
  const n = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
}
function fa(n: number) { return n.toLocaleString("fa-IR"); }

export function PropertyScenarioAnalysis({ property }: { property: Property }) {
  const base = numeric(property.price);
  const [discount, setDiscount] = useState(0);
  const [renovation, setRenovation] = useState(0);
  const [sideCosts, setSideCosts] = useState(1);
  const [areaChange, setAreaChange] = useState(0);

  const rows = useMemo(() => {
    const scenarioPrice = Math.max(0, base * (1 - discount / 100));
    const renovationAmount = base * renovation / 100;
    const sideAmount = scenarioPrice * sideCosts / 100;
    const total = scenarioPrice + renovationAmount + sideAmount;
    const perMeter = property.areaM2 && property.areaM2 > 0 ? total / Math.max(1, property.areaM2 * (1 + areaChange / 100)) : 0;
    return { scenarioPrice, renovationAmount, sideAmount, total, perMeter };
  }, [areaChange, base, discount, property.areaM2, renovation, sideCosts]);

  const reset = () => {
    setDiscount(0);
    setRenovation(0);
    setSideCosts(1);
    setAreaChange(0);
  };

  return (
    <section className="property-scenario-tool" aria-labelledby="property-scenario-title">
      <header className="property-scenario-head">
        <div>
          <span className="kicker">تحلیل «اگر»</span>
          <h2 id="property-scenario-title"><BarChart3 size={20} /> مقایسه سناریوی خرید</h2>
          <p>چهار متغیر را تغییر دهید و ببینید هزینه مؤثر خرید چگونه تغییر می‌کند. این اعداد صرفاً سناریوی شخصی هستند و هزینه قانونی یا قطعی معامله محسوب نمی‌شوند.</p>
        </div>
        <button type="button" className="property-scenario-reset" onClick={reset}><RefreshCcw size={14} /> بازنشانی</button>
      </header>
      {base > 0 ? (
        <div className="property-scenario-layout">
          <div className="property-scenario-controls">
            <label><span>تخفیف: {fa(discount)}٪</span><input type="range" min="0" max="20" step="1" value={discount} onChange={(e) => setDiscount(Number(e.target.value))} /></label>
            <label><span>بودجه نوسازی: {fa(renovation)}٪ قیمت فایل</span><input type="range" min="0" max="20" step="1" value={renovation} onChange={(e) => setRenovation(Number(e.target.value))} /></label>
            <label><span>هزینه جانبی سناریو: {sideCosts.toLocaleString("fa-IR")}٪</span><input type="range" min="0" max="5" step=".25" value={sideCosts} onChange={(e) => setSideCosts(Number(e.target.value))} /></label>
            {property.areaM2 ? (
              <label><span>تغییر متراژ مؤثر: {areaChange > 0 ? "+" : ""}{fa(areaChange)}٪</span><input type="range" min="-10" max="20" step="5" value={areaChange} onChange={(e) => setAreaChange(Number(e.target.value))} /></label>
            ) : null}
          </div>
          <div className="property-scenario-results">
            <div><span>قیمت پس از تخفیف</span><strong>{formatToman(rows.scenarioPrice)} تومان</strong></div>
            <div><span>نوسازی فرضی</span><strong>{formatToman(rows.renovationAmount)} تومان</strong></div>
            <div><span>هزینه جانبی فرضی</span><strong>{formatToman(rows.sideAmount)} تومان</strong></div>
            <div className="is-total"><span>هزینه مؤثر سناریو</span><strong>{formatToman(rows.total)} تومان</strong></div>
            {rows.perMeter ? <div><span>هزینه مؤثر هر متر</span><strong>{formatToman(rows.perMeter)} تومان</strong></div> : null}
            <div className="property-scenario-note"><Minus size={14} /> هدف این ابزار مقایسه «چه می‌شود اگر...» است، نه پیش‌بینی قیمت یا توصیه قطعی.</div>
          </div>
        </div>
      ) : (
        <p className="property-scenario-empty">برای تحلیل سناریو، قیمت فروش عددی این فایل لازم است.</p>
      )}
    </section>
  );
}
