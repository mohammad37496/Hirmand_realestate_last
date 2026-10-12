import { useCallback, useEffect, useState } from "react";
import { History, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { formatToman } from "@/lib/money";

type Item = {
  id: number;
  priceBefore: number | null; priceAfter: number | null;
  depositBefore: number | null; depositAfter: number | null;
  rentBefore: number | null; rentAfter: number | null;
  pricePercent: number | null; depositPercent: number | null; rentPercent: number | null;
  note: string; createdBy: string; createdAt: string;
};

const money = (v: number | null) => v == null ? "—" : formatToman(v);
const date = (v: string) => new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(v));

export function AdminPropertyPriceHistory({ propertyId }: { propertyId: string }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-property-price-history", {
        method: "POST", headers: { "content-type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ propertyId }),
      });
      const data = (await response.json()) as { history?: Item[]; statusMessage?: string };
      if (!response.ok) throw new Error(data.statusMessage || "تاریخچه قیمت بارگذاری نشد.");
      setItems(Array.isArray(data.history) ? data.history : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تاریخچه قیمت بارگذاری نشد.");
    } finally { setLoading(false); }
  }, [propertyId]);
  useEffect(() => { void load(); }, [load]);

  return (
    <fieldset className="admin-section admin-price-history" dir="rtl">
      <legend><History size={15} /> تاریخچه قیمت و تغییرات</legend>
      <div className="admin-price-history-head"><div><span className="kicker">کنترل قیمت</span><p>تغییرات فروش، رهن و اجاره ثبت می‌شوند؛ سوابق قبل از فعال‌شدن این قابلیت ممکن است موجود نباشند.</p></div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "admin-spin" : ""} /> بروزرسانی</button>
      </div>
      {loading ? <div className="admin-empty">در حال دریافت تاریخچه…</div> : !items.length ? <div className="admin-empty">هنوز تغییر قیمت ثبت نشده است.</div> :
        <div className="admin-price-history-list">{items.map((item) => {
          const changes: Array<{ label: string; before: number | null; after: number | null; percent: number | null }> = [];
          if (item.priceBefore !== item.priceAfter && (item.priceBefore != null || item.priceAfter != null)) changes.push({ label: "فروش", before: item.priceBefore, after: item.priceAfter, percent: item.pricePercent });
          if (item.depositBefore !== item.depositAfter && (item.depositBefore != null || item.depositAfter != null)) changes.push({ label: "رهن", before: item.depositBefore, after: item.depositAfter, percent: item.depositPercent });
          if (item.rentBefore !== item.rentAfter && (item.rentBefore != null || item.rentAfter != null)) changes.push({ label: "اجاره", before: item.rentBefore, after: item.rentAfter, percent: item.rentPercent });
          return <article className="admin-price-history-row" key={item.id}>
            <div className="admin-price-history-main"><strong>{date(item.createdAt)}</strong><small>{item.createdBy || "مدیریت"}{item.note ? " · " + item.note : ""}</small></div>
            <div className="admin-price-history-changes">{changes.map((change) => {
              const down = change.after != null && change.before != null && change.after < change.before;
              return <div key={change.label}><span>{change.label}</span><b>{money(change.before)} ← {money(change.after)}</b><small>{change.percent == null ? "تغییر مقدار" : <>{down ? <TrendingDown size={12} /> : <TrendingUp size={12} />}{change.percent > 0 ? "+" : ""}{change.percent.toLocaleString("fa-IR")}٪</>}</small></div>;
            })}</div>
          </article>;
        })}</div>}
    </fieldset>
  );
}