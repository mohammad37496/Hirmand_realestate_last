import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, CheckCircle2, Ruler, Search, TrendingUp } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { listNeighborhoodNames } from "@/lib/neighborhoods";
import { listPublishedPropertyCards, type PropertyCardData, type PropertyType } from "@/lib/properties";
import { NEIGHBORHOOD_NAMES, PROPERTY_TYPES, SITE } from "@/lib/site";
import "@/valuation.css";

const PROPERTY_TYPE_OPTIONS: { value: PropertyType; label: string }[] = [
  ...PROPERTY_TYPES.map((item) => ({ value: item.id as PropertyType, label: item.title })),
  { value: "land", label: "زمین" },
  { value: "commercial", label: "تجاری" },
];

function toNumber(raw: string) {
  const normalized = raw
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[٬،,\s]/g, "");
  if (!/^\d+$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function money(value: number) {
  return Math.round(value).toLocaleString("fa-IR") + " تومان";
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * p;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * (index - lower);
}

function median(values: number[]) {
  return percentile(values, 0.5);
}

function buildUnitPrices(rows: PropertyCardData[]) {
  return rows
    .map((row) => {
      const price = row.price ? Number(row.price) : NaN;
      const area = row.areaM2 ?? 0;
      return Number.isFinite(price) && price > 0 && area > 0 ? price / area : null;
    })
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
}

function chooseComparables(rows: PropertyCardData[], fallback: PropertyCardData[]) {
  const primary = buildUnitPrices(rows);
  if (primary.length >= 3) return { values: primary, sampleRows: rows };
  const broader = buildUnitPrices(fallback);
  if (broader.length > primary.length) return { values: broader, sampleRows: fallback };
  return { values: primary, sampleRows: rows };
}

export const Route = createFileRoute("/valuation")({
  head: () => {
    const title = "ارزیابی اولیه قیمت ملک | " + SITE.nameFa;
    const description = "برآورد اولیه ارزش فروش ملک بر اساس فایل‌های مشابه منتشرشده در هیرمند؛ مناسب برای شروع قیمت‌گذاری، نه جایگزین کارشناسی رسمی.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { name: "robots", content: "index, follow" },
      ],
      links: [{ rel: "canonical", href: SITE.url + "/valuation" }],
    };
  },
  component: ValuationPage,
});

function ValuationPage() {
  const [neighborhoods, setNeighborhoods] = useState<string[]>(NEIGHBORHOOD_NAMES);
  const [propertyType, setPropertyType] = useState<PropertyType>("apartment");
  const [neighborhood, setNeighborhood] = useState("");
  const [area, setArea] = useState("");
  const [bedrooms, setBedrooms] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    estimate: number;
    low: number;
    high: number;
    unitPrice: number;
    sampleCount: number;
    source: string;
    rows: PropertyCardData[];
  } | null>(null);
  const [error, setError] = useState("");
  const [requestName, setRequestName] = useState("");
  const [requestPhone, setRequestPhone] = useState("");
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestDone, setRequestDone] = useState(false);
  const [requestError, setRequestError] = useState("");

  useEffect(() => {
    let cancelled = false;
    void listNeighborhoodNames().then((items) => {
      if (!cancelled && items.length) setNeighborhoods(items);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const validArea = useMemo(() => toNumber(area), [area]);
  const validBedrooms = useMemo(() => {
    const value = toNumber(bedrooms);
    return value && value <= 30 ? Math.round(value) : null;
  }, [bedrooms]);

  async function calculate() {
    setError("");
    setResult(null);
    if (!validArea || validArea < 30 || validArea > 2000) {
      setError("متراژ را بین ۳۰ تا ۲٬۰۰۰ متر وارد کنید.");
      return;
    }
    setLoading(true);
    try {
      const base = {
        transactionType: "sell" as const,
        propertyType,
        neighborhood: neighborhood || undefined,
        minBedrooms: validBedrooms ?? undefined,
        sort: "newest" as const,
      };
      const exact = await listPublishedPropertyCards({ data: base });
      let broad: PropertyCardData[] = exact;

      if (exact.length < 3 && validBedrooms != null) {
        broad = await listPublishedPropertyCards({
          data: { transactionType: "sell", propertyType, neighborhood: neighborhood || undefined, sort: "newest" },
        });
      }
      if (buildUnitPrices(broad).length < 3 && neighborhood) {
        broad = await listPublishedPropertyCards({
          data: { transactionType: "sell", propertyType, sort: "newest" },
        });
      }
      if (buildUnitPrices(broad).length < 3) {
        const fallbackBuy = await listPublishedPropertyCards({
          data: { transactionType: "buy", propertyType, neighborhood: neighborhood || undefined, sort: "newest" },
        });
        if (buildUnitPrices(fallbackBuy).length > buildUnitPrices(broad).length) broad = fallbackBuy;
      }

      const selected = chooseComparables(exact, broad);
      if (selected.values.length < 2) {
        setError("برای این ترکیب، فایل مشابه کافی برای برآورد پیدا نشد. محله یا نوع ملک را بازتر انتخاب کنید.");
        return;
      }

      const q1 = percentile(selected.values, 0.25);
      const q3 = percentile(selected.values, 0.75);
      const unitPrice = median(selected.values);
      const estimated = unitPrice * validArea;
      const spreadLow = Math.min(unitPrice, Math.max(q1, unitPrice * 0.86));
      const spreadHigh = Math.max(spreadLow, q3);
      const rows = selected.sampleRows.filter((row) => row.price && row.areaM2).slice(0, 6);

      setResult({
        estimate: estimated,
        low: spreadLow * validArea,
        high: spreadHigh * validArea,
        unitPrice,
        sampleCount: selected.values.length,
        source: selected.sampleRows === exact ? "فایل‌های مشابه همان محله و نوع ملک" : neighborhood ? "فایل‌های مشابه نوع ملک با داده گسترده‌تر" : "فایل‌های مشابه منتشرشده برای این نوع ملک",
        rows,
      });
    } catch {
      setError("برآورد قیمت انجام نشد. دوباره تلاش کنید.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="valuation-page">
      <header className="valuation-hero">
        <div className="valuation-hero-icon" aria-hidden="true"><Calculator size={28} strokeWidth={1.8} /></div>
        <div>
          <span className="kicker">ابزار جدید هیرمند</span>
          <h1>ارزیابی اولیه قیمت ملک</h1>
          <p>متراژ و مشخصات اصلی ملک را وارد کنید تا بر اساس فایل‌های مشابه منتشرشده، یک بازه اولیه برای قیمت فروش داشته باشید.</p>
        </div>
      </header>

      <section className="valuation-grid">
        <form className="valuation-card valuation-form" onSubmit={(event) => { event.preventDefault(); void calculate(); }}>
          <div className="valuation-section-head"><span className="kicker">۱</span><div><h2>مشخصات ملک</h2><p>هرچه اطلاعات نزدیک‌تر باشد، مقایسه هم دقیق‌تر می‌شود.</p></div></div>
          <div className="valuation-form-grid">
            <label><span>نوع ملک</span><select value={propertyType} onChange={(event) => setPropertyType(event.target.value as PropertyType)}>{PROPERTY_TYPE_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            <label><span>محله</span><select value={neighborhood} onChange={(event) => setNeighborhood(event.target.value)}><option value="">همه محله‌ها</option>{neighborhoods.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            <label><span>متراژ</span><div className="valuation-input-suffix"><input inputMode="numeric" value={area} onChange={(event) => setArea(event.target.value)} placeholder="مثلاً ۱۲۰" /><small>متر</small></div></label>
            <label><span>تعداد خواب</span><input inputMode="numeric" value={bedrooms} onChange={(event) => setBedrooms(event.target.value)} placeholder="اختیاری" /></label>
          </div>
          {error ? <div className="valuation-error" role="alert">{error}</div> : null}
          <button type="submit" className="btn-gold valuation-submit" disabled={loading}>{loading ? <TrendingUp size={17} className="valuation-spin" /> : <Search size={17} />}{loading ? "در حال بررسی فایل‌های مشابه…" : "محاسبه برآورد اولیه"}</button>
          <div className="valuation-note"><CheckCircle2 size={16} /><span>این ابزار قیمت کارشناسی یا تضمین قیمت معامله نیست؛ فقط از داده فایل‌های موجود هیرمند برای یک برآورد اولیه استفاده می‌کند.</span></div>
        </form>

        <section className="valuation-card valuation-result" aria-live="polite">
          {!result ? <div className="valuation-result-empty"><Ruler size={28} /><strong>نتیجه اینجا نمایش داده می‌شود</strong><p>بعد از محاسبه، قیمت تقریبی هر متر، برآورد کل و دامنه پیشنهادی را می‌بینید.</p></div> : (
            <>
              <div className="valuation-section-head"><span className="kicker">۲</span><div><h2>نتیجه برآورد</h2><p>{result.source} · {result.sampleCount.toLocaleString("fa-IR")} داده قیمتی</p></div></div>
              <div className="valuation-primary"><span>برآورد میانی</span><strong>{money(result.estimate)}</strong></div>
              <div className="valuation-range"><div><small>بازه پایین</small><strong>{money(result.low)}</strong></div><div><small>قیمت هر متر</small><strong>{money(result.unitPrice)}</strong></div><div><small>بازه بالا</small><strong>{money(result.high)}</strong></div></div>
              {result.rows.length ? <div className="valuation-comparables"><div className="valuation-comparables-head"><strong>نمونه فایل‌های استفاده‌شده</strong><Link to="/properties">مشاهده همه فایل‌ها</Link></div><div className="valuation-comparables-list">{result.rows.map((row) => <Link key={row.id} to="/properties/$slug" params={{ slug: row.slug }} className="valuation-comparable"><span><strong>{row.title}</strong><small>{row.neighborhood} · {row.areaM2?.toLocaleString("fa-IR")} متر</small></span><b>{money(Number(row.price))}</b></Link>)}</div></div> : null}
            </>
          )}
        </section>
      </section>

      {result ? (
        <section className="valuation-request-card" aria-labelledby="valuation-request-title">
          <div>
            <span className="kicker">ادامه با مشاور</span>
            <h2 id="valuation-request-title">ارزیابی دقیق‌تر می‌خواهید؟</h2>
            <p>درخواست شما در CRM هیرمند ثبت می‌شود تا مشاور برای بررسی اطلاعات ملک با شما تماس بگیرد.</p>
          </div>
          {requestDone ? <div className="valuation-request-success">✓ درخواست ارزیابی ثبت شد.</div> : (
            <>
              <div className="valuation-request-grid">
                <label><span>نام و نام خانوادگی</span><input value={requestName} onChange={(e)=>setRequestName(e.target.value)} autoComplete="name" /></label>
                <label><span>شماره موبایل</span><input value={requestPhone} onChange={(e)=>setRequestPhone(e.target.value)} inputMode="tel" dir="ltr" placeholder="0912..." /></label>
              </div>
              {requestError ? <p className="valuation-request-error" role="alert">{requestError}</p> : null}
              <button type="button" className="btn-gold" disabled={requestBusy} onClick={() => {
                const phone = requestPhone.replace(/[۰-۹]/g,d=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(d))).replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g,"");
                if (requestName.trim().length < 2) return setRequestError("نام و نام خانوادگی را وارد کنید.");
                if (!/^09\d{9}$/.test(phone)) return setRequestError("شماره موبایل معتبر وارد کنید.");
                setRequestBusy(true); setRequestError("");
                void fetch("/api/leads", {
                  method:"POST", headers:{"content-type":"application/json"},
                  body:JSON.stringify({
                    name:requestName.trim(), phone, peopleCount:1, job:"مالک",
                    deal:"ارزیابی ملک", propertyType, neighborhood, consultant:"",
                    note:"درخواست ارزیابی پس از برآورد آنلاین · متراژ: "+validArea+" متر · خواب: "+(validBedrooms ?? "ثبت نشده")+" · برآورد میانی: "+Math.round(result.estimate).toLocaleString("fa-IR")+" تومان",
                    source:"website", matches:[]
                  })
                }).then(async response=>{
                  const payload=await response.json().catch(()=>null);
                  if(!response.ok || !payload?.success) throw new Error(payload?.statusMessage||payload?.message||"ثبت درخواست ارزیابی انجام نشد.");
                  setRequestDone(true);
                }).catch(error=>setRequestError(error instanceof Error?error.message:"ثبت درخواست ارزیابی انجام نشد."))
                .finally(()=>setRequestBusy(false));
              }}>
                {requestBusy ? "در حال ثبت…" : "درخواست تماس مشاور برای ارزیابی"}
              </button>
            </>
          )}
        </section>
      ) : null}
      <section className="valuation-footer-card"><div><span className="kicker">مرحله بعد</span><h2>برای قیمت‌گذاری دقیق‌تر، فایل‌های واقعی همان محله را ببینید.</h2><p>می‌توانید همین حالا فایل‌های مشابه را مقایسه کنید یا با مشاور هیرمند برای بررسی شرایط ملک صحبت کنید.</p></div><div className="valuation-footer-actions"><Link to="/compare" className="btn-ghost">مقایسه فایل‌ها</Link><Link to="/properties" className="btn-gold">مشاهده فایل‌های مشابه</Link></div></section>
    </main>
  );
}