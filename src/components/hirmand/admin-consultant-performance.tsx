import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, BriefcaseBusiness, WalletCards, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { AdminErrorBanner } from "@/components/hirmand/admin-ui";
import { formatToman } from "@/lib/money";

type Row = {
  name: string;
  leads: number;
  contractedLeads: number;
  openLeads: number;
  deals: number;
  completedDeals: number;
  volume: number;
  commissions: number;
  paid: number;
  due: number;
  conversionRate: number;
};

const compact = (value: number) => value.toLocaleString("fa-IR");
const money = (value: number) => formatToman(Math.round(value));

export function AdminConsultantPerformance() {
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const requestRef = useRef(0);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setAvailable(null);
    setLoadError("");
    try {
      const response = await fetch("/api/admin-consultant-performance?days=" + days);
      const data = (await response.json()) as { available?: boolean; consultants?: Row[]; statusMessage?: string };
      if (!response.ok) throw new Error(data.statusMessage || "گزارش عملکرد مشاوران آماده نشد.");
      if (typeof data.available !== "boolean" || !Array.isArray(data.consultants)) {
        throw new Error("Invalid consultant performance response.");
      }
      if (requestId !== requestRef.current) return;
      setAvailable(data.available);
      setRows(data.available ? data.consultants : []);
    } catch (error) {
      if (requestId !== requestRef.current) return;
      const message = error instanceof Error ? error.message : "گزارش عملکرد مشاوران آماده نشد.";
      setLoadError(message);
      toast.error(message);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    void load();
    return () => { requestRef.current += 1; };
  }, [load]);

  const totals = rows.reduce((acc, row) => ({
    leads: acc.leads + row.leads,
    deals: acc.deals + row.deals,
    completed: acc.completed + row.completedDeals,
    volume: acc.volume + row.volume,
    due: acc.due + row.due,
  }), { leads: 0, deals: 0, completed: 0, volume: 0, due: 0 });

  return (
    <section className="admin-consultant-performance" dir="rtl">
      <div className="admin-panel">
        <div className="admin-panel-head">
          <div>
            <span className="kicker">مدیریت تیم</span>
            <h2><BarChart3 size={18} /> عملکرد مشاوران</h2>
            <p>درخواست‌ها، معاملات، حجم معامله و کمیسیون هر مشاور را در یک نما مقایسه کنید.</p>
          </div>
          <select className="admin-lead-status-select" value={days} onChange={(e) => setDays(Number(e.target.value))}>
            <option value={30}>۳۰ روز اخیر</option>
            <option value={90}>۹۰ روز اخیر</option>
            <option value={365}>یک سال اخیر</option>
          </select>
        </div>

        {loadError ? <AdminErrorBanner message={loadError} onRetry={() => void load()} /> : null}
        {available === false && !loadError ? <AdminErrorBanner message={"گزارش عملکرد مشاوران آماده نشد."} onRetry={() => void load()} /> : null}
        {available === true && !loadError ? (
        <div className="admin-kpi-cards admin-performance-kpis">
          <div className="admin-kpi-card"><UsersRound size={16} /><span>درخواست‌ها</span><strong>{compact(totals.leads)}</strong></div>
          <div className="admin-kpi-card"><BriefcaseBusiness size={16} /><span>معاملات</span><strong>{compact(totals.deals)}</strong></div>
          <div className="admin-kpi-card"><BarChart3 size={16} /><span>تکمیل‌شده</span><strong>{compact(totals.completed)}</strong></div>
          <div className="admin-kpi-card"><WalletCards size={16} /><span>حجم معاملات</span><strong>{money(totals.volume)}</strong></div>
          <div className="admin-kpi-card"><WalletCards size={16} /><span>سهم کمیسیون در انتظار</span><strong>{money(totals.due)}</strong></div>
        </div>
        ) : null}

        {loading ? <div className="admin-empty">در حال محاسبه…</div> : available === true && !loadError && !rows.length ? <div className="admin-empty">برای این بازه هنوز فعالیت ثبت نشده است.</div> : available === true && !loadError ? (
          <div className="admin-performance-table-wrap">
            <table className="admin-performance-table">
              <thead><tr><th>مشاور</th><th>لید</th><th>معامله</th><th>تکمیل</th><th>نرخ تبدیل</th><th>حجم معامله</th><th>کمیسیون</th><th>پرداخت‌شده</th><th>مانده</th></tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.name}>
                    <td><strong>{row.name}</strong><small>{compact(row.openLeads)} درخواست باز</small></td>
                    <td>{compact(row.leads)}</td>
                    <td>{compact(row.deals)}</td>
                    <td>{compact(row.completedDeals)}</td>
                    <td><b>{row.conversionRate.toLocaleString("fa-IR")}%</b></td>
                    <td>{money(row.volume)}</td>
                    <td>{money(row.commissions)}</td>
                    <td>{money(row.paid)}</td>
                    <td>{money(row.due)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </section>
  );
}
