import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, UsersRound } from "lucide-react";
import { toast } from "sonner";

type Data = {
  days: number;
  statuses: Array<{ key: string; label: string; count: number }>;
  sources: Array<{ source: string; count: number }>;
  aging: Array<{ key: string; count: number }>;
  conversions: { total: number; contacted: number; visited: number; contract: number; contactedRate: number; visitRate: number; contractRate: number };
};
const fa = (v: number) => v.toLocaleString("fa-IR");
const agingLabels: Record<string,string> = { less_24h: "کمتر از ۲۴ ساعت", "1_3d": "۱ تا ۳ روز", "3_7d": "۳ تا ۷ روز", over_7d: "بیش از ۷ روز" };

export function AdminSalesFunnel() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-sales-funnel?days=" + days, { credentials: "same-origin" });
      const payload = (await response.json()) as Data & { statusMessage?: string };
      if (!response.ok) throw new Error(payload.statusMessage || "قیف فروش بارگذاری نشد.");
      setData(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "قیف فروش بارگذاری نشد.");
    } finally { setLoading(false); }
  }, [days]);
  useEffect(() => { void load(); }, [load]);
  const maxStatus = useMemo(() => Math.max(1, ...(data?.statuses.map((x) => x.count) ?? [1])), [data]);
  return <section className="admin-panel admin-sales-funnel" dir="rtl">
    <div className="admin-panel-head"><div><span className="kicker">CRM و فروش</span><h2><BarChart3 size={18} /> قیف فروش و تبدیل لید</h2><p>ببینید چند درخواست وارد شده، در کدام مرحله مانده و چه مقدار به قرارداد رسیده است.</p></div>
      <select className="admin-lead-status-select" value={days} onChange={(e) => setDays(Number(e.target.value))}><option value={7}>۷ روز</option><option value={30}>۳۰ روز</option><option value={90}>۹۰ روز</option></select>
    </div>
    {loading && !data ? <div className="admin-empty">در حال محاسبه…</div> : data ? <>
      <div className="admin-funnel-summary"><div><span>کل لید</span><strong>{fa(data.conversions.total)}</strong></div><div><span>تماس</span><strong>{fa(data.conversions.contacted)} · {fa(data.conversions.contactedRate)}٪</strong></div><div><span>بازدید</span><strong>{fa(data.conversions.visited)} · {fa(data.conversions.visitRate)}٪</strong></div><div><span>قرارداد</span><strong>{fa(data.conversions.contract)} · {fa(data.conversions.contractRate)}٪</strong></div></div>
      <div className="admin-funnel-layout"><div className="admin-funnel-chart">
        {data.statuses.map((item) => <div className="admin-funnel-row" key={item.key}><div><span>{item.label}</span><b>{fa(item.count)}</b></div><i style={{ width: Math.max(3, (item.count / maxStatus) * 100) + "%" }} /></div>)}
      </div><div className="admin-funnel-side"><h3><UsersRound size={15} /> سن لیدهای باز</h3>
        {data.aging.map((item) => <div key={item.key}><span>{agingLabels[item.key]}</span><b>{fa(item.count)}</b></div>)}
        <h3 className="admin-funnel-subhead">منبع جذب</h3>{data.sources.slice(0,6).map((item) => <div key={item.source}><span>{item.source}</span><b>{fa(item.count)}</b></div>)}
      </div></div>
    </> : null}
  </section>;
}