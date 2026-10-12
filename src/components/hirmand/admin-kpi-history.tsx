import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { toast } from "sonner";

type Snapshot = {
  date: string;
  propertiesTotal: number;
  publishedProperties: number;
  leadsTotal: number;
  leadsLast7: number;
  contractsLast30: number;
  visitorsLast7: number;
  callsLast30: number;
  whatsappLast30: number;
  overdueFollowups: number;
  incompleteProperties: number;
};

function fa(value: number) { return value.toLocaleString("fa-IR"); }

export function AdminKpiHistory() {
  const [items, setItems] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (sync = false) => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-kpi-snapshot" + (sync ? "?action=sync" : ""), {
        method: "GET",
        credentials: "same-origin",
        headers: { accept: "application/json" },
      });
      const data = await response.json().catch(() => ({})) as { snapshots?: Snapshot[]; statusMessage?: string };
      if (!response.ok) throw new Error(data.statusMessage || "تاریخچه KPI دریافت نشد.");
      setItems(data.snapshots ?? []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تاریخچه KPI دریافت نشد.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(true); }, [load]);

  const ordered = useMemo(() => [...items].sort((a, b) => a.date.localeCompare(b.date)), [items]);
  const latest = ordered.at(-1);
  const previous = ordered.at(-2);

  function delta(key: keyof Snapshot) {
    const a = latest ? Number(latest[key]) : 0;
    const b = previous ? Number(previous[key]) : 0;
    return a - b;
  }

  const metrics = latest ? [
    ["لید ۷ روز", latest.leadsLast7, delta("leadsLast7")],
    ["قرارداد ۳۰ روز", latest.contractsLast30, delta("contractsLast30")],
    ["بازدیدکننده ۷ روز", latest.visitorsLast7, delta("visitorsLast7")],
    ["تماس ۳۰ روز", latest.callsLast30, delta("callsLast30")],
    ["واتساپ ۳۰ روز", latest.whatsappLast30, delta("whatsappLast30")],
    ["پیگیری عقب‌افتاده", latest.overdueFollowups, -delta("overdueFollowups")],
  ] as const : [];

  return (
    <section className="admin-panel admin-kpi-history" aria-labelledby="admin-kpi-history-title">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">روند مدیریتی</span>
          <h2 id="admin-kpi-history-title"><BarChart3 size={19} /> تاریخچه KPI روزانه</h2>
          <p className="admin-dashboard-summary">شاخص‌های امروز ذخیره می‌شوند تا تغییرات را نسبت به روز قبل ببینید.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load(true)} disabled={loading}>
          <RefreshCw size={14} className={loading ? "admin-spin" : ""} /> بروزرسانی
        </button>
      </div>
      {!latest ? <div className="admin-empty">هنوز snapshot روزانه ساخته نشده است.</div> : (
        <>
          <div className="admin-kpi-cards">
            {metrics.map(([label, value, change]) => (
              <div key={label} className="admin-kpi-card">
                <span>{label}</span>
                <strong>{fa(value)}</strong>
                <small className={change > 0 ? "is-up" : change < 0 ? "is-down" : ""}>
                  {change > 0 ? <TrendingUp size={13} /> : change < 0 ? <TrendingDown size={13} /> : null}
                  {change === 0 ? "بدون تغییر" : (change > 0 ? "+" : "") + fa(change) + " نسبت به روز قبل"}
                </small>
              </div>
            ))}
          </div>
          <div className="admin-kpi-trend" aria-label="روند ۱۴ روزه لید و قرارداد">
            {ordered.slice(-14).map((item) => (
              <div key={item.date} className="admin-kpi-day">
                <span>{new Date(item.date + "T12:00:00").toLocaleDateString("fa-IR", { day: "numeric", month: "short" })}</span>
                <div className="admin-kpi-bars" aria-label={"لید ۷ روز: " + fa(item.leadsLast7)}>
                  <i style={{ height: Math.min(100, Math.max(8, item.leadsLast7 * 7)) + "%" }} />
                  <i style={{ height: Math.min(100, Math.max(8, item.contractsLast30 * 12)) + "%" }} />
                </div>
                <small>{fa(item.leadsLast7)} / {fa(item.contractsLast30)}</small>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
