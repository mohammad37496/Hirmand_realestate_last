import { useEffect, useMemo, useState } from "react";
import { Hammer, Plus, RotateCcw, Trash2 } from "lucide-react";
import type { Property } from "@/lib/properties";
import { formatToman } from "@/lib/money";
import "@/property-renovation-tracker.css";

const KEY_PREFIX = "hirmand-property-renovation-v1:";

type Item = {
  id: string;
  title: string;
  estimate: number;
  actual: number;
};

const DEFAULT_ITEMS = ["نقاشی", "کف‌سازی", "آشپزخانه", "سرویس‌ها", "تأسیسات", "درب و پنجره"];

function money(value: number) {
  return value > 0 ? formatToman(Math.round(value)) + " تومان" : "۰";
}

function readItems(id: string): Item[] {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + id);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return DEFAULT_ITEMS.map((title, index) => ({ id: "r" + index, title, estimate: 0, actual: 0 }));
    return parsed.filter((item): item is Item => Boolean(item) && typeof item === "object" && typeof item.title === "string")
      .map((item) => ({ id: String(item.id), title: item.title.slice(0, 100), estimate: Number(item.estimate) || 0, actual: Number(item.actual) || 0 }))
      .slice(0, 20);
  } catch {
    return DEFAULT_ITEMS.map((title, index) => ({ id: "r" + index, title, estimate: 0, actual: 0 }));
  }
}

export function PropertyRenovationTracker({ property }: { property: Property }) {
  const [items, setItems] = useState<Item[]>(() => readItems(property.id));

  useEffect(() => {
    try {
      localStorage.setItem(KEY_PREFIX + property.id, JSON.stringify(items));
    } catch {
      // Optional browser persistence.
    }
  }, [items, property.id]);

  const totals = useMemo(() => ({
    estimate: items.reduce((sum, item) => sum + item.estimate, 0),
    actual: items.reduce((sum, item) => sum + item.actual, 0),
  }), [items]);

  function update(id: string, field: "title" | "estimate" | "actual", value: string) {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      if (field === "title") return { ...item, title: value.slice(0, 100) };
      const numeric = Math.max(0, Number(value.replace(/,/g, "")) || 0);
      return { ...item, [field]: numeric };
    }));
  }

  function addItem() {
    setItems((current) => current.length >= 20 ? current : [...current, { id: crypto.randomUUID(), title: "هزینه جدید", estimate: 0, actual: 0 }]);
  }

  function reset() {
    setItems(DEFAULT_ITEMS.map((title, index) => ({ id: "r" + index, title, estimate: 0, actual: 0 })));
  }

  return (
    <section className="property-renovation" aria-labelledby="property-renovation-title">
      <header className="property-renovation-head">
        <div>
          <span className="kicker">بودجه بازسازی</span>
          <h2 id="property-renovation-title"><Hammer size={19} /> ریزهزینه‌های بازسازی و تجهیز</h2>
          <p>بودجه بازسازی را به‌صورت موردی ثبت کنید و برآورد اولیه را با هزینه واقعی مقایسه کنید. این محاسبه قیمت بازار یا برآورد کارشناسی نیست.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={reset}><RotateCcw size={15} /> بازنشانی</button>
      </header>

      <div className="property-renovation-summary">
        <div><span>برآورد کل</span><strong>{money(totals.estimate)}</strong></div>
        <div><span>هزینه واقعی ثبت‌شده</span><strong>{money(totals.actual)}</strong></div>
        <div><span>اختلاف</span><strong>{money(totals.actual - totals.estimate)}</strong></div>
      </div>

      <div className="property-renovation-table">
        <div className="property-renovation-row property-renovation-row-head"><span>مورد</span><span>برآورد</span><span>واقعی</span><span /></div>
        {items.map((item) => (
          <div className="property-renovation-row" key={item.id}>
            <input value={item.title} onChange={(e) => update(item.id, "title", e.target.value)} aria-label="عنوان هزینه" />
            <input inputMode="numeric" value={item.estimate || ""} onChange={(e) => update(item.id, "estimate", e.target.value)} aria-label="برآورد هزینه" placeholder="تومان" />
            <input inputMode="numeric" value={item.actual || ""} onChange={(e) => update(item.id, "actual", e.target.value)} aria-label="هزینه واقعی" placeholder="تومان" />
            <button type="button" onClick={() => setItems((current) => current.filter((entry) => entry.id !== item.id))} aria-label="حذف هزینه"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <button type="button" className="btn-ghost" onClick={addItem} disabled={items.length >= 20}><Plus size={15} /> افزودن ردیف هزینه</button>
      {property.transactionType !== "rent" ? <p className="property-renovation-note">این ریزهزینه‌ها را می‌توانید جدا از «بودجه نهایی خرید» مدیریت کنید.</p> : null}
    </section>
  );
}
