import { useCallback, useEffect, useState } from "react";
import { BarChart3, RefreshCw, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { AdminErrorBanner } from "@/components/hirmand/admin-ui";

const fa = (value: number) => Number(value || 0).toLocaleString("fa-IR");
const money = (value: number) => fa(value) + " تومان";

type Data = {
  available: boolean;
  months: Array<{ month: string; income: number; expense: number; balance: number }>;
  categories: Array<{ category: string; income: number; expense: number }>;
  consultants: Array<{ name: string; due: number; paid: number }>;
  outstanding: number;
};

export function AdminFinanceInsights() {
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin-finance-insights");
      const result = await response.json().catch(() => null) as (Data & { statusMessage?: string }) | null;
      if (!response.ok) throw new Error(result?.statusMessage || "گزارش مالی دریافت نشد.");
      if (!result || typeof result.available !== "boolean" || !Array.isArray(result.months) || !Array.isArray(result.categories) || !Array.isArray(result.consultants)) {
        throw new Error("ساختار پاسخ گزارش مالی معتبر نیست.");
      }
      setData(result);
      if (!result.available) setError("اطلاعات مالی در دسترس نیست؛ پایگاه داده پیکربندی نشده است.");
    } catch (loadError) {
      setData(null);
      setError(loadError instanceof Error ? loadError.message : "گزارش مالی دریافت نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const totalIncome = data?.months.reduce((sum, item) => sum + item.income, 0) ?? 0;
  const totalExpense = data?.months.reduce((sum, item) => sum + item.expense, 0) ?? 0;
  const profit = totalIncome - totalExpense;

  return <section className="admin-panel admin-finance-insights" dir="rtl">
    <div className="admin-panel-head"><div><span className="kicker">گزارش مدیریتی</span><h2>روند سود، هزینه و تعهدات</h2><p>جمع‌بندی ۱۲ ماه اخیر بر اساس دفتر مالی و تسویه کمیسیون.</p></div><button className="btn-ghost" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} className={loading ? "admin-spin" : ""}/> بروزرسانی</button></div>
    {error ? <AdminErrorBanner message={error} onRetry={() => void load()}/> : loading && !data ? <div className="admin-empty">در حال دریافت گزارش مالی…</div> : data?.available ? <>
      <div className="admin-dashboard-mini-grid"><div><span>درآمد ۱۲ ماه</span><strong>{money(totalIncome)}</strong></div><div><span>هزینه ۱۲ ماه</span><strong>{money(totalExpense)}</strong></div><div><span>خالص</span><strong>{money(profit)}</strong></div><div><span>تسویه باز</span><strong>{fa(data.outstanding)}</strong></div></div>
      <div className="admin-finance-insights-grid">
        <div className="admin-finance-chart"><h3><BarChart3 size={16}/> روند ماهانه</h3>{data.months.length ? data.months.map((month) => { const max = Math.max(month.income, month.expense, 1); return <div className="admin-finance-month" key={month.month}><span>{month.month}</span><div><i style={{ width: (month.income / max * 100) + "%" }}/><b>{money(month.income)}</b></div><div><i className="expense" style={{ width: (month.expense / max * 100) + "%" }}/><b>{money(month.expense)}</b></div></div>; }) : <div className="admin-empty">داده‌ای برای نمودار وجود ندارد.</div>}</div>
        <div className="admin-finance-chart"><h3><WalletCards size={16}/> تسویه مشاوران</h3>{data.consultants.length ? data.consultants.map((consultant) => <div className="admin-finance-consultant" key={consultant.name}><div><strong>{consultant.name}</strong><small>پرداخت: {money(consultant.paid)}</small></div><b>{money(consultant.due)}</b></div>) : <div className="admin-empty">هنوز تسویه‌ای ثبت نشده.</div>}</div>
      </div>
      <div className="admin-finance-category"><h3><TrendingUp size={16}/> دسته‌بندی‌های اصلی</h3>{data.categories.slice(0, 8).map((category) => <div key={category.category}><span>{category.category}</span><small><TrendingUp size={12}/> {money(category.income)} · <TrendingDown size={12}/> {money(category.expense)}</small></div>)}</div>
    </> : null}
  </section>;
}
