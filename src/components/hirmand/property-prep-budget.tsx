import { useMemo, useState } from "react";
import { Brush, Calculator, Check, Home, Ruler } from "lucide-react";
import type { Property } from "@/lib/properties";

function numberValue(value: string) {
  const normalized = value
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[,٬،\s]/g, "");
  const result = Number(normalized);
  return Number.isFinite(result) && result >= 0 ? Math.round(result) : 0;
}
function fa(value: number) { return value.toLocaleString("fa-IR"); }

export function PropertyPrepBudget({ property }: { property: Property }) {
  const [rate, setRate] = useState("0");
  const [kitchen, setKitchen] = useState("0");
  const [bathroom, setBathroom] = useState("0");
  const [painting, setPainting] = useState("0");
  const [fixtures, setFixtures] = useState("0");
  const [contingency, setContingency] = useState("10");

  const area = property.areaM2 ?? 0;
  const renovationBase = useMemo(() => area * numberValue(rate), [area, rate]);
  const subtotal = renovationBase + numberValue(kitchen) + numberValue(bathroom) + numberValue(painting) + numberValue(fixtures);
  const reserve = Math.round(subtotal * numberValue(contingency) / 100);
  const total = subtotal + reserve;

  return (
    <section id="property-prep-budget" className="property-new-feature property-prep-budget" aria-labelledby="property-prep-budget-title">
      <header className="property-new-feature-head">
        <div>
          <span className="kicker"><Brush size={14} /> آماده‌سازی ملک</span>
          <h2 id="property-prep-budget-title">بودجه بازسازی و آماده‌سازی را خودتان بسازید</h2>
          <p>نرخ‌ها را با قیمت‌های واقعی پیمانکار یا برآورد شخصی خودتان وارد کنید؛ سایت هیچ نرخ بازاری فرضی را تحمیل نمی‌کند.</p>
        </div>
        <span className="property-new-feature-badge"><Home size={13} /> سناریوی شخصی</span>
      </header>

      <div className="property-prep-metrics">
        <div><span><Ruler size={14} /> مساحت مبنا</span><strong>{area ? fa(area) + " متر" : "ثبت نشده"}</strong></div>
        <div><span>بازسازی پایه</span><strong>{renovationBase ? fa(renovationBase) + " تومان" : "—"}</strong></div>
        <div><span>جمع نهایی با ذخیره</span><strong>{total ? fa(total) + " تومان" : "—"}</strong></div>
      </div>

      <div className="property-prep-grid">
        <label><span>هزینه بازسازی هر متر</span><input value={rate} onChange={(e) => setRate(e.target.value)} inputMode="numeric" placeholder="مثلاً ۴٬۰۰۰٬۰۰۰" /></label>
        <label><span>کابینت و آشپزخانه</span><input value={kitchen} onChange={(e) => setKitchen(e.target.value)} inputMode="numeric" placeholder="۰" /></label>
        <label><span>سرویس و حمام</span><input value={bathroom} onChange={(e) => setBathroom(e.target.value)} inputMode="numeric" placeholder="۰" /></label>
        <label><span>رنگ و نقاشی</span><input value={painting} onChange={(e) => setPainting(e.target.value)} inputMode="numeric" placeholder="۰" /></label>
        <label><span>تأسیسات و تجهیزات</span><input value={fixtures} onChange={(e) => setFixtures(e.target.value)} inputMode="numeric" placeholder="۰" /></label>
        <label><span>ذخیره پیش‌بینی‌نشده: {fa(numberValue(contingency))}٪</span><input type="range" min="0" max="30" step="1" value={numberValue(contingency)} onChange={(e) => setContingency(e.target.value)} /></label>
      </div>

      <div className="property-prep-total">
        <div><span><Calculator size={17} /> جمع قبل از ذخیره</span><strong>{fa(subtotal)} تومان</strong></div>
        <div><span><Check size={17} /> ذخیره پیش‌بینی‌نشده</span><strong>{fa(reserve)} تومان</strong></div>
        <div className="is-highlight"><span>بودجه آماده‌سازی</span><strong>{fa(total)} تومان</strong></div>
      </div>
      <small className="property-prep-note">محاسبه شخصی است؛ نرخ، کیفیت مصالح، دستمزد و دامنه کار را خودتان تعیین می‌کنید.</small>
    </section>
  );
}
