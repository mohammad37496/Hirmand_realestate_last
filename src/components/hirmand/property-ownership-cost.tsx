import { useEffect, useMemo, useState } from "react";
import { Home, ShieldCheck, Wrench } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import "@/property-ownership-cost.css";

const KEY_PREFIX = "hirmand-property-ownership-cost-v1:";

type Costs = {
  charge: number;
  maintenance: number;
  insurance: number;
  tax: number;
  utilities: number;
  management: number;
  loan: number;
};

function read(id: string): Costs {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + id);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== "object") return { charge: 0, maintenance: 0, insurance: 0, tax: 0, utilities: 0, management: 0, loan: 0 };
    return {
      charge: Math.max(0, Number(parsed.charge) || 0),
      maintenance: Math.max(0, Number(parsed.maintenance) || 0),
      insurance: Math.max(0, Number(parsed.insurance) || 0),
      tax: Math.max(0, Number(parsed.tax) || 0),
      utilities: Math.max(0, Number(parsed.utilities) || 0),
      management: Math.max(0, Number(parsed.management) || 0),
      loan: Math.max(0, Number(parsed.loan) || 0),
    };
  } catch {
    return { charge: 0, maintenance: 0, insurance: 0, tax: 0, utilities: 0, management: 0, loan: 0 };
  }
}

function money(value: number) {
  return value > 0 ? formatToman(Math.round(value)) + " تومان" : "۰";
}

export function PropertyOwnershipCost({ property }: { property: Property }) {
  const [costs, setCosts] = useState<Costs>(() => read(property.id));

  useEffect(() => {
    try { localStorage.setItem(KEY_PREFIX + property.id, JSON.stringify(costs)); } catch { /* optional */ }
  }, [costs, property.id]);

  const monthly = useMemo(() => Object.values(costs).reduce((sum, value) => sum + value, 0), [costs]);
  const annual = monthly * 12;
  const purchasePrice = Number(String(property.price ?? "").replace(/,/g, "")) || 0;
  const annualCostRate = purchasePrice > 0 ? annual / purchasePrice * 100 : null;

  function patch(key: keyof Costs, value: string) {
    setCosts((current) => ({ ...current, [key]: Math.max(0, Number(value.replace(/,/g, "")) || 0) }));
  }

  return (
    <section className="property-ownership-cost" aria-labelledby="property-ownership-cost-title">
      <header className="property-ownership-cost-head">
        <div>
          <span className="kicker">هزینه پس از معامله</span>
          <h2 id="property-ownership-cost-title"><Home size={19} /> هزینه ماهانه مالکیت و نگهداری</h2>
          <p>شارژ، نگهداری، بیمه، مالیات، قبوض، مدیریت و قسط را طبق برآورد شخصی خودتان وارد کنید. این ارقام برآورد شما هستند، نه هزینه قطعی یا نرخ رسمی.</p>
        </div>
        <div className="property-ownership-cost-badges"><span><Wrench size={14} /> هزینه ماهانه</span><strong>{money(monthly)}</strong></div>
      </header>

      <div className="property-ownership-cost-grid">
        <label><span>شارژ ماهانه</span><input inputMode="numeric" value={costs.charge || ""} onChange={(e) => patch("charge", e.target.value)} placeholder="تومان" /></label>
        <label><span>نگهداری ماهانه</span><input inputMode="numeric" value={costs.maintenance || ""} onChange={(e) => patch("maintenance", e.target.value)} placeholder="تومان" /></label>
        <label><span>بیمه ماهانه</span><input inputMode="numeric" value={costs.insurance || ""} onChange={(e) => patch("insurance", e.target.value)} placeholder="تومان" /></label>
        <label><span>مالیات ماهانه‌شده</span><input inputMode="numeric" value={costs.tax || ""} onChange={(e) => patch("tax", e.target.value)} placeholder="تومان" /></label>
        <label><span>قبوض و خدمات</span><input inputMode="numeric" value={costs.utilities || ""} onChange={(e) => patch("utilities", e.target.value)} placeholder="تومان" /></label>
        <label><span>مدیریت/مشاور</span><input inputMode="numeric" value={costs.management || ""} onChange={(e) => patch("management", e.target.value)} placeholder="تومان" /></label>
        <label><span>قسط وام</span><input inputMode="numeric" value={costs.loan || ""} onChange={(e) => patch("loan", e.target.value)} placeholder="تومان" /></label>
      </div>

      <div className="property-ownership-cost-summary">
        <div><span>ماهانه</span><strong>{money(monthly)}</strong></div>
        <div><span>سالانه</span><strong>{money(annual)}</strong></div>
        <div><span>هزینه سالانه نسبت به قیمت خرید</span><strong>{annualCostRate == null ? "—" : annualCostRate.toLocaleString("fa-IR", { maximumFractionDigits: 2 }) + "٪"}</strong></div>
        <div><span>جنس محاسبه</span><strong><ShieldCheck size={14} /> شخصی و قابل‌تنظیم</strong></div>
      </div>
    </section>
  );
}
