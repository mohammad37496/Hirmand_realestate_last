import { useCallback, useEffect, useRef, useState } from "react";
import { BarChart3, Download, Printer, RefreshCw, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { formatToman } from "@/lib/money";
import { csvCell } from "@/lib/csv";
import { hasAdminPermission, type AdminRole } from "@/lib/admin-roles";
import { AdminErrorBanner } from "@/components/hirmand/admin-ui";

type Data = {
  available: true;
  days: number;
  properties: { created: number; published: number; draft: number; archived: number };
  leads: { created: number; open: number; contract: number; closed: number };
  deals: { created: number; completed: number; contracted: number; volume: number; commission: number };
  finance: { income: number; expense: number; balance: number } | null;
  topConsultants: Array<{ name: string; deals: number; volume: number }>;
};
const fa = (v: number) => v.toLocaleString("fa-IR");
const money = (v: number) => formatToman(Math.round(v));

export function AdminManagementReport({ role }: { role: AdminRole }) {
  const canViewDeals = hasAdminPermission(role, "deal.manage");
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const requestSequence = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setLoadError("");
    setData(null);
    try {
      const response = await fetch("/api/admin-management-report?days=" + days, { credentials: "same-origin" });
      const payload = (await response.json()) as Partial<Data> & { statusMessage?: string };
      if (!response.ok) throw new Error(payload.statusMessage || "گزارش مدیریتی بارگذاری نشد.");
      if (payload.available !== true || !payload.properties || !payload.leads || !payload.deals || !Array.isArray(payload.topConsultants) || payload.days !== days) {
        throw new Error(payload.statusMessage || "پایگاه داده در دسترس نیست؛ گزارش مدیریتی بارگذاری نشد.");
      }
      if (requestId === requestSequence.current) setData(payload as Data);
    } catch (error) {
      if (requestId === requestSequence.current) {
        const message = error instanceof Error ? error.message : "گزارش مدیریتی بارگذاری نشد.";
        setData(null);
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  }, [days]);
  useEffect(() => {
    void load();
    return () => { requestSequence.current += 1; };
  }, [load]);

  function downloadCsv() {
    if (!data || data.available !== true || data.days !== days || loading) return;
    const rows = [
      ["گزارش هیرمند", data.days + " روز اخیر"],
      ["فایل‌های ایجادشده", String(data.properties.created)],
      ["فایل‌های منتشرشده", String(data.properties.published)],
      ["لیدهای ایجادشده", String(data.leads.created)],
      ["لیدهای باز", String(data.leads.open)],
      ["قرارداد", String(data.leads.contract)],
      ["معامله تکمیل‌شده", String(data.deals.completed)],
      ...(canViewDeals ? [["حجم معاملات", String(data.deals.volume)], ["کمیسیون معاملات", String(data.deals.commission)]] : []),
      ...(data.finance ? [["درآمد دفتر", String(data.finance.income)], ["هزینه دفتر", String(data.finance.expense)], ["مانده دفتر", String(data.finance.balance)]] : []),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "hirmand-management-report.csv"; anchor.click(); URL.revokeObjectURL(url);
  }

  return <section className="admin-panel admin-management-report" dir="rtl">
    <div className="admin-panel-head"><div><span className="kicker">مدیریت ارشد</span><h2><BarChart3 size={18} /> گزارش مدیریتی</h2><p>گزارش فشرده فایل‌ها، CRM، معاملات و در صورت دسترسی، امور مالی.</p></div>
      <div className="admin-report-actions"><select className="admin-lead-status-select" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>۷ روز اخیر</option><option value={30}>۳۰ روز اخیر</option><option value={90}>۹۰ روز اخیر</option><option value={365}>یک سال اخیر</option></select>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> بروزرسانی</button>
        <button type="button" className="btn-ghost" onClick={() => window.print()} disabled={!data || data.days !== days || loading}><Printer size={14} /> چاپ</button>
        <button type="button" className="btn-gold" onClick={downloadCsv} disabled={!data || data.days !== days || loading}><Download size={14} /> CSV</button>
      </div>
    </div>
    {loadError ? <AdminErrorBanner message={loadError} onRetry={() => void load()} /> : loading || !data || data.days !== days ? <div className="admin-empty">در حال آماده‌سازی گزارش…</div> : data ? <>
      <div className="admin-report-kpis"><div><span>فایل‌های جدید</span><strong>{fa(data.properties.created)}</strong></div><div><span>لیدهای جدید</span><strong>{fa(data.leads.created)}</strong></div><div><span>معامله تکمیل‌شده</span><strong>{fa(data.deals.completed)}</strong></div>{canViewDeals ? <><div><span>حجم معاملات</span><strong>{money(data.deals.volume)}</strong></div><div><span>کمیسیون</span><strong>{money(data.deals.commission)}</strong></div></> : null}{data.finance ? <div><span>مانده مالی</span><strong>{money(data.finance.balance)}</strong></div> : null}</div>
      <div className="admin-report-grid"><section><h3>وضعیت فایل‌ها</h3><p>منتشرشده {fa(data.properties.published)} · پیش‌نویس {fa(data.properties.draft)} · بایگانی {fa(data.properties.archived)}</p></section>
        <section><h3>وضعیت CRM</h3><p>لید باز {fa(data.leads.open)} · قرارداد {fa(data.leads.contract)} · بسته‌شده {fa(data.leads.closed)}</p></section>
        {data.finance ? <section><h3><WalletCards size={15} /> مالی</h3><p>درآمد {money(data.finance.income)} · هزینه {money(data.finance.expense)} · مانده {money(data.finance.balance)}</p></section> : null}
        {canViewDeals ? <section><h3>مشاوران برتر</h3><div className="admin-report-consultants">{data.topConsultants.map((item) => <div key={item.name}><strong>{item.name}</strong><span>{fa(item.deals)} معامله · {money(item.volume)}</span></div>)}</div></section> : null}
      </div>
    </> : null}
  </section>;
}
