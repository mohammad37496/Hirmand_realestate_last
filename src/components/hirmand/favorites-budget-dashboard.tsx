import { useMemo, useState } from "react";
import { Calculator, WalletCards } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import "@/favorite-budget-dashboard.css";

function moneyValue(value: string | null) {
  const n = value == null ? NaN : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function money(value: number) {
  return value > 0 ? formatToman(Math.round(value)) + " تومان" : "ثبت نشده";
}

function transactionLabel(property: Property) {
  return property.transactionType === "rent" ? "اجاره" : property.transactionType === "mortgage" ? "رهن" : "خرید";
}

export function FavoritesBudgetDashboard({ properties }: { properties: Property[] }) {
  const [buyCap, setBuyCap] = useState("");
  const [depositCap, setDepositCap] = useState("");
  const [rentCap, setRentCap] = useState("");

  const stats = useMemo(() => {
    const buy = properties.filter((p) => p.transactionType === "buy" || p.transactionType === "sell");
    const rent = properties.filter((p) => p.transactionType === "rent");
    const mortgage = properties.filter((p) => p.transactionType === "mortgage");
    const prices = buy.map((p) => moneyValue(p.price)).filter(Boolean);
    const deposits = [...rent, ...mortgage].map((p) => moneyValue(p.deposit)).filter(Boolean);
    const rents = rent.map((p) => moneyValue(p.rent)).filter(Boolean);
    const areas = properties.map((p) => p.areaM2).filter((v): v is number => v != null && v > 0);
    return {
      buyCount: buy.length,
      rentCount: rent.length,
      mortgageCount: mortgage.length,
      totalListedBuy: prices.reduce((sum, v) => sum + v, 0),
      totalDeposit: deposits.reduce((sum, v) => sum + v, 0),
      totalRent: rents.reduce((sum, v) => sum + v, 0),
      averageArea: areas.length ? areas.reduce((sum, v) => sum + v, 0) / areas.length : 0,
    };
  }, [properties]);

  const buyLimit = Number(buyCap.replace(/,/g, "")) || 0;
  const depositLimit = Number(depositCap.replace(/,/g, "")) || 0;
  const rentLimit = Number(rentCap.replace(/,/g, "")) || 0;

  const rows = properties.map((property) => {
    if (property.transactionType === "buy" || property.transactionType === "sell") {
      const price = moneyValue(property.price);
      return {
        property,
        value: price,
        limit: buyLimit,
        label: buyLimit > 0 && price > 0 ? (price <= buyLimit ? "داخل سقف خرید" : "بالاتر از سقف خرید") : "سقف خرید تعیین نشده",
      };
    }
    if (property.transactionType === "rent" || property.transactionType === "mortgage") {
      const deposit = moneyValue(property.deposit);
      const rent = property.transactionType === "rent" ? moneyValue(property.rent) : 0;
      const depositOk = depositLimit <= 0 || deposit <= depositLimit || deposit === 0;
      const rentOk = property.transactionType !== "rent" || rentLimit <= 0 || rent <= rentLimit || rent === 0;
      return {
        property,
        value: property.transactionType === "rent" ? rent : deposit,
        limit: property.transactionType === "rent" ? rentLimit : depositLimit,
        label:
          !depositLimit && property.transactionType === "mortgage"
            ? "سقف رهن تعیین نشده"
            : property.transactionType === "rent" && !rentLimit
              ? "سقف اجاره تعیین نشده"
              : depositOk && rentOk
                ? "داخل سقف‌های ثبت‌شده"
                : "بالاتر از سقف ثبت‌شده",
      };
    }
    return { property, value: 0, limit: 0, label: "اطلاعات بودجه کافی نیست" };
  });

  if (!properties.length) return null;

  return (
    <section className="favorite-budget-dashboard" aria-labelledby="favorite-budget-title">
      <header className="favorite-budget-head">
        <div>
          <span className="kicker">بودجه سبد</span>
          <h2 id="favorite-budget-title"><WalletCards size={19} /> داشبورد مالی فایل‌های منتخب</h2>
          <p>این ابزار فقط جمع‌بندی عددهای ثبت‌شده در فایل‌ها و سقف‌هایی است که خودتان وارد می‌کنید؛ هزینه‌های جانبی معامله، مالیات و وام را محاسبه نمی‌کند.</p>
        </div>
        <Calculator size={22} />
      </header>

      <div className="favorite-budget-summary">
        <div><span>فایل خرید/فروش</span><strong>{stats.buyCount.toLocaleString("fa-IR")}</strong></div>
        <div><span>فایل اجاره</span><strong>{stats.rentCount.toLocaleString("fa-IR")}</strong></div>
        <div><span>مجموع قیمت‌های ثبت‌شده خرید</span><strong>{money(stats.totalListedBuy)}</strong></div>
        <div><span>مجموع رهن‌های ثبت‌شده</span><strong>{money(stats.totalDeposit)}</strong></div>
        <div><span>مجموع اجاره‌های ماهانه ثبت‌شده</span><strong>{money(stats.totalRent)}</strong></div>
        <div><span>میانگین متراژ</span><strong>{stats.averageArea ? stats.averageArea.toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + " متر" : "ثبت نشده"}</strong></div>
      </div>

      <div className="favorite-budget-inputs">
        <label><span>سقف خرید نقدی (تومان)</span><input inputMode="numeric" value={buyCap} onChange={(e) => setBuyCap(e.target.value)} placeholder="مثلاً ۸٬۰۰۰٬۰۰۰٬۰۰۰" /></label>
        <label><span>سقف رهن (تومان)</span><input inputMode="numeric" value={depositCap} onChange={(e) => setDepositCap(e.target.value)} placeholder="مثلاً ۵۰۰٬۰۰۰٬۰۰۰" /></label>
        <label><span>سقف اجاره ماهانه (تومان)</span><input inputMode="numeric" value={rentCap} onChange={(e) => setRentCap(e.target.value)} placeholder="مثلاً ۲۰٬۰۰۰٬۰۰۰" /></label>
      </div>

      <div className="favorite-budget-rows">
        {rows.map(({ property, label }) => (
          <div className="favorite-budget-row" key={property.id}>
            <div><strong>{property.title}</strong><span>{property.neighborhood} · {transactionLabel(property)}</span></div>
            <span className="favorite-budget-pill">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
