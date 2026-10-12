import { useEffect, useState } from "react";
import { Activity, BarChart3 } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import { getPropertyMarketComparison, type PropertyMarketComparison } from "@/lib/property-market-comparison";
import "@/property-market-comparison.css";

function money(value: number | null) {
  return value && value > 0 ? formatToman(Math.round(value)) + " تومان" : "—";
}

/** Stored money columns are decimal strings; the validator wants a number. */
function amount(value: string | null | undefined) {
  if (value == null || !String(value).trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function PropertyMarketComparison({ property }: { property: Property }) {
  const [result, setResult] = useState<PropertyMarketComparison | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void getPropertyMarketComparison({
      data: {
        id: property.id,
        propertyType: property.propertyType,
        transactionType: property.transactionType,
        neighborhood: property.neighborhood,
        areaM2: property.areaM2 ?? null,
        price: amount(property.price),
        rent: amount(property.rent),
      },
    }).then((next) => {
      if (!cancelled) setResult(next);
    }).catch(() => {
      if (!cancelled) setResult(null);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [property]);

  if (loading) return <section className="property-market-comparison" aria-label="مقایسه بازار"><div className="property-market-comparison-loading">در حال مقایسه با فایل‌های مشابه محله…</div></section>;
  if (!result || result.comparableCount < 2 || result.unitMedian == null) return null;

  const isSale = property.transactionType === "sell" || property.transactionType === "buy";
  const currentTitle = isSale ? "قیمت این فایل / متر" : "اجاره این فایل";
  const medianTitle = isSale ? "میانه قیمت / متر" : "میانه اجاره ماهانه";
  const diff = result.differencePercent;
  const diffText = diff == null ? "بدون مقایسه" : String(Math.abs(diff).toFixed(1)).replace(".", "٫") + "٪ " + (diff > 0 ? "بالاتر" : "پایین‌تر") + " از میانه";

  return (
    <section className="property-market-comparison" aria-label="مقایسه قیمت با فایل‌های مشابه">
      <div className="property-market-comparison-head">
        <div className="property-market-comparison-title">
          <BarChart3 size={18} aria-hidden="true" />
          <div><h3>مقایسه با فایل‌های مشابه محله</h3><p>فایل‌های منتشرشده، هم‌نوع و نزدیک از نظر متراژ بررسی شده‌اند.</p></div>
        </div>
        <span className="property-market-comparison-badge">{result.comparableCount.toLocaleString("fa-IR")} مورد</span>
      </div>
      <div className="property-market-comparison-metrics">
        <div className="property-market-comparison-metric"><span>{currentTitle}</span><strong>{money(result.currentUnit)}</strong></div>
        <div className="property-market-comparison-metric"><span>{medianTitle}</span><strong>{money(result.unitMedian)}</strong></div>
        <div className="property-market-comparison-metric"><span>میانگین مشابه‌ها</span><strong>{money(result.unitAverage)}</strong></div>
      </div>
      <div className="property-market-comparison-foot"><Activity size={14} aria-hidden="true" /><span>{diffText} · مبنا {property.neighborhood} و حدود ۲۵٪ بازه متراژ · برای اطلاع اولیه، نه کارشناسی رسمی.</span></div>
    </section>
  );
}