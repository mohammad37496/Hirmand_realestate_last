import { useCallback, useEffect, useState } from "react";
import { BarChart3, BriefcaseBusiness, WalletCards, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { addDecimalStrings } from "@/lib/decimal-money";
import { formatTomanExact } from "@/lib/money";

type Row = {
  id: string;
  name: string;
  leads: number;
  contractedLeads: number;
  openLeads: number;
  deals: number;
  completedDeals: number;
  volume: string | null;
  commissions: string | null;
  paid: string | null;
  due: string | null;
  conversionRate: number | null;
};

const compact = (value: number) => value.toLocaleString("fa-IR");
const money = (value: string | null) => value == null ? "?" : formatTomanExact(value);

export function AdminConsultantPerformance() {
  const [days, setDays] = useState(90);
  const [rows, setRows] = useState<Row[]>([]);
  const [access, setAccess] = useState({ deals: false, commissions: false });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-consultant-performance?days=" + days);
      const data = (await response.json()) as { consultants?: Row[]; access?: { deals?: boolean; commissions?: boolean }; statusMessage?: string };
      if (!response.ok) throw new Error(data.statusMessage || "گزارش عملکرد آماده نشد.");
      setRows(Array.isArray(data.consultants) ? data.consultants : []);
      setAccess({ deals: data.access?.deals === true, commissions: data.access?.commissions === true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "گزارش عملکرد مشاوران آماده نشد.");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const totals = rows.reduce<{ leads: number; deals: number; completed: number; volume: string | null; due: string | null }>((acc, row) => ({
    leads: acc.leads + row.leads,
    deals: acc.deals + row.deals,
    completed: acc.completed + row.completedDeals,
    volume: acc.volume == null || row.volume == null ? null : addDecimalStrings(acc.volume, row.volume),
    due: acc.due == null || row.due == null ? null : addDecimalStrings(acc.due, row.due),
  }), { leads: 0, deals: 0, completed: 0, volume: "0", due: "0" });

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

        <div className="admin-kpi-cards admin-performance-kpis">
          <div className="admin-kpi-card"><UsersRound size={16} /><span>درخواست‌ها</span><strong>{compact(totals.leads)}</strong></div>
          <div className="admin-kpi-card"><BriefcaseBusiness size={16} /><span>معاملات</span><strong>{compact(totals.deals)}</strong></div>
          <div className="admin-kpi-card"><BarChart3 size={16} /><span>تکمیل‌شده</span><strong>{compact(totals.completed)}</strong></div>
          {access.deals ? <div className="admin-kpi-card"><WalletCards size={16} /><span>حجم معاملات</span><strong>{money(totals.volume)}</strong></div> : null}
          {access.commissions ? <div className="admin-kpi-card"><WalletCards size={16} /><span>سهم کمیسیون در انتظار</span><strong>{money(totals.due)}</strong></div> : null}
        </div>

        {loading ? <div className="admin-empty">در حال محاسبه…</div> : !rows.length ? <div className="admin-empty">برای این بازه هنوز فعالیت ثبت نشده است.</div> : (
          <div className="admin-performance-table-wrap">
            <table className="admin-performance-table">
              <thead><tr><th>مشاور</th><th>لید</th><th>معامله</th><th>تکمیل</th><th>نرخ تبدیل</th>{access.deals ? <th>حجم معامله</th> : null}{access.commissions ? <><th>کمیسیون</th><th>پرداخت‌شده</th><th>مانده</th></> : null}</tr></thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id}>
                    <td><strong>{row.name}</strong><small>{compact(row.openLeads)} درخواست باز</small></td>
                    <td>{compact(row.leads)}</td>
                    <td>{compact(row.deals)}</td>
                    <td>{compact(row.completedDeals)}</td>
                    <td><b>{row.conversionRate == null ? "—" : row.conversionRate.toLocaleString("fa-IR") + "%"}</b></td>
                    {access.deals ? <td>{money(row.volume)}</td> : null}{access.commissions ? <><td>{money(row.commissions)}</td><td>{money(row.paid)}</td><td>{money(row.due)}</td></> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
