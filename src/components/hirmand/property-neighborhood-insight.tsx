import { useEffect, useMemo, useState } from "react";
import { BarChart3, Home, Ruler, TrendingUp } from "lucide-react";
import { listPublishedPropertyCards, type Property, type PropertyCardData } from "@/lib/properties";
import "@/property-neighborhood-insight.css";

function amount(value: string | null) {
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatMoney(value: number | null) {
  if (!value || value <= 0) return "—";
  return Math.round(value).toLocaleString("fa-IR") + " تومان";
}

function median(values: number[]) {
  if (!values.length) return null;
  const ordered = [...values].sort((a, b) => a - b);
  const mid = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[mid] : (ordered[mid - 1] + ordered[mid]) / 2;
}

function compactRange(min: number | null, max: number | null) {
  if (!min || !max) return "—";
  return Math.round(min).toLocaleString("fa-IR") + " تا " + Math.round(max).toLocaleString("fa-IR") + " متر";
}

export function PropertyNeighborhoodInsight({ property }: { property: Property }) {
  const [rows, setRows] = useState<PropertyCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void listPublishedPropertyCards({
      data: {
        neighborhood: property.neighborhood,
        sort: "newest",
        offset: 0,
      },
    }).then((items) => {
      if (!cancelled) setRows(items);
    }).catch(() => {
      if (!cancelled) setRows([]);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [property.neighborhood]);

  const insight = useMemo(() => {
    const all = rows.filter((item) => item.slug !== property.slug);
    const sales = all
      .filter((item) => item.transactionType === "sell" || item.transactionType === "buy")
      .map((item) => {
        const price = amount(item.price);
        const area = item.areaM2 ?? 0;
        return price && area > 0 ? price / area : null;
      })
      .filter((value): value is number => value != null);

    const rents = all
      .filter((item) => item.transactionType === "rent")
      .map((item) => amount(item.rent))
      .filter((value): value is number => value != null);

    const areas = all.map((item) => item.areaM2 ?? 0).filter((value) => value > 0);
    const byType = new Map<string, number>();
    all.forEach((item) => byType.set(item.propertyType, (byType.get(item.propertyType) ?? 0) + 1));
    const dominantType = [...byType.entries()].sort((a, b) => b[1] - a[1])[0];

    return {
      count: all.length,
      medianPerM2: median(sales),
      medianRent: median(rents),
      minArea: areas.length ? Math.min(...areas) : null,
      maxArea: areas.length ? Math.max(...areas) : null,
      dominantType: dominantType?.[0] ?? null,
    };
  }, [property.slug, rows]);

  if (loading) {
    return (
      <section className="property-neighborhood-insight">
        <div className="property-neighborhood-insight-loading">در حال محاسبه تصویر کلی محله…</div>
      </section>
    );
  }

  if (insight.count < 2) return null;

  const currentPrice = amount(property.price);
  const currentArea = property.areaM2 ?? 0;
  const currentPerM2 = currentPrice && currentArea > 0 ? currentPrice / currentArea : null;

  return (
    <section className="property-neighborhood-insight" aria-labelledby="property-neighborhood-insight-title">
      <header className="property-neighborhood-insight-head">
        <div>
          <span className="kicker"><BarChart3 size={14} /> نبض محله</span>
          <h2 id="property-neighborhood-insight-title">تصویر کلی فایل‌های فعال در {property.neighborhood}</h2>
          <p>این شاخص‌ها از فایل‌های منتشرشده فعلی سایت هیرمند در همین محله محاسبه شده‌اند؛ آمار رسمی معاملات بازار نیستند.</p>
        </div>
      </header>
      <div className="property-neighborhood-insight-grid">
        <article><span><Home size={15} /> فایل‌های فعال</span><strong>{insight.count.toLocaleString("fa-IR")}</strong></article>
        <article><span><Ruler size={15} /> بازه متراژ</span><strong>{compactRange(insight.minArea, insight.maxArea)}</strong></article>
        <article><span><TrendingUp size={15} /> میانه قیمت هر متر</span><strong>{formatMoney(insight.medianPerM2)}</strong></article>
        <article><span><Home size={15} /> میانه اجاره ماهانه</span><strong>{formatMoney(insight.medianRent)}</strong></article>
      </div>
      {currentPerM2 && insight.medianPerM2 ? (
        <div className="property-neighborhood-insight-current">
          قیمت تقریبی هر متر این فایل: <strong>{formatMoney(currentPerM2)}</strong>
          <span> · میانه فایل‌های خرید/فروش محله: <strong>{formatMoney(insight.medianPerM2)}</strong></span>
        </div>
      ) : null}
    </section>
  );
}
