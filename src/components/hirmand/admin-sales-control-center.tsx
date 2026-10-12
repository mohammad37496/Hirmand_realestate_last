import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  Clock3,
  Eye,
  Phone,
  RefreshCw,
  Search,
  Target,
  UsersRound,
} from "lucide-react";

type ConsultantRow = {
  id: string;
  name: string;
  phone: string;
  active: boolean;
  files: number;
  leads: number;
  periodLeads: number;
  activeLeads: number;
  new7d: number;
  overdueLeads: number;
  nextFollowUps: number;
  visitRequests: number;
  contracts: number;
  periodContracts: number;
  views: number;
  conversionRate: number;
};

type SalesData = {
  days: 7 | 30 | 90;
  pipeline: {
    new: number;
    contacted: number;
    follow_up: number;
    visited: number;
    contract: number;
  };
  summary: {
    consultants: number;
    activeConsultants: number;
    activeLeads: number;
    overdueLeads: number;
    visitRequests: number;
    contracts: number;
    totalViews: number;
  };
  consultants: ConsultantRow[];
};

type Props = {
  onOpenLeads: () => void;
  onOpenProperties: () => void;
};

const fa = (value: number) => value.toLocaleString("fa-IR");
const pct = (value: number) => value.toLocaleString("fa-IR", { maximumFractionDigits: 1 }) + "٪";

function priorityTone(item: ConsultantRow) {
  if (item.overdueLeads > 0) return "urgent";
  if (item.visitRequests > 0 || item.nextFollowUps > 0) return "attention";
  return "ok";
}

export function AdminSalesControlCenter({ onOpenLeads, onOpenProperties }: Props) {
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [data, setData] = useState<SalesData | null>(null);
  const [query, setQuery] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextDays: 7 | 30 | 90 = 30) => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-sales-control-center", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ days: nextDays }),
      });
      const result = (await response.json().catch(() => null)) as SalesData | { statusMessage?: string; message?: string } | null;
      if (!response.ok) throw new Error(
        (result && "statusMessage" in result ? result.statusMessage : null)
          || (result && "message" in result ? result.message : null)
          || "گزارش مرکز کنترل فروش در دسترس نیست.",
      );
      setData(result as SalesData);
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "بارگذاری انجام نشد.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(days);
  }, [days, load]);

  const rows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("fa-IR");
    return (data?.consultants ?? []).filter((item) => {
      if (onlyActive && !item.active) return false;
      if (!normalized) return true;
      return item.name.toLocaleLowerCase("fa-IR").includes(normalized) || item.phone.includes(query.trim());
    });
  }, [data, onlyActive, query]);


  return (
    <section className="admin-panel admin-sales-control" aria-label="مرکز کنترل فروش مشاوران">
      <style>{`
        .admin-sales-control{margin-top:18px;overflow:hidden}
        .admin-sales-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap}
        .admin-sales-title{display:grid;gap:4px}
        .admin-sales-title h2{margin:4px 0 0;color:var(--navy-900);font-size:1.08rem}
        .admin-sales-title p{margin:0;color:var(--muted);font-size:.76rem;line-height:1.9}
        .admin-sales-toolbar{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
        .admin-sales-range{display:inline-flex;align-items:center;padding:3px;border:1px solid var(--line);border-radius:12px;background:var(--surface-2,#f7f5f0)}
        .admin-sales-range button{border:0;background:transparent;color:var(--muted);padding:7px 10px;border-radius:9px;font:inherit;font-size:.7rem;font-weight:800;cursor:pointer}
        .admin-sales-range button.is-active{background:var(--card,#fff);color:var(--navy-900);box-shadow:0 2px 10px rgb(18 35 51 / 8%)}
        .admin-sales-refresh{display:inline-flex;align-items:center;gap:6px}
        .admin-sales-summary{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin:14px 0}
        .admin-sales-summary-card{display:grid;gap:5px;padding:11px 12px;border:1px solid var(--line);border-radius:12px;background:var(--card,#fff)}
        .admin-sales-summary-card span{display:flex;align-items:center;gap:6px;color:var(--muted);font-size:.67rem;font-weight:700}
        .admin-sales-summary-card strong{color:var(--navy-900);font-size:1.02rem}
        .admin-sales-summary-card[data-tone="urgent"]{background:var(--danger-bg,#fff3f1);border-color:rgb(163 49 39 / 22%)}
        .admin-sales-summary-card[data-tone="attention"]{background:var(--brass-50,#fbf7ef);border-color:rgb(184 133 48 / 25%)}
        .admin-sales-body{display:grid;grid-template-columns:minmax(0,1fr) 260px;gap:12px;align-items:start}
        .admin-sales-table-wrap{border:1px solid var(--line);border-radius:14px;overflow:auto;background:var(--card,#fff)}
        .admin-sales-table{width:100%;border-collapse:collapse;min-width:820px}
        .admin-sales-table th,.admin-sales-table td{padding:10px 11px;border-bottom:1px solid var(--line);text-align:right;vertical-align:middle}
        .admin-sales-table th{background:var(--surface-2,#f7f5f0);color:var(--subtle);font-size:.64rem;font-weight:800;white-space:nowrap;position:sticky;top:0;z-index:1}
        .admin-sales-table td{color:var(--muted);font-size:.7rem}
        .admin-sales-table tbody tr:last-child td{border-bottom:0}
        .admin-sales-table tbody tr:hover td{background:var(--surface-2,#faf9f5)}
        .admin-sales-consultant{display:flex;align-items:center;gap:9px;min-width:185px}
        .admin-sales-avatar{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:var(--brass-50,#fbf7ef);color:var(--brass-700);flex:none}
        .admin-sales-consultant strong{display:block;color:var(--navy-900);font-size:.73rem}
        .admin-sales-consultant small{display:block;margin-top:2px;color:var(--subtle);font-size:.6rem;direction:ltr;text-align:right}
        .admin-sales-status{display:inline-flex;align-items:center;gap:5px;margin-top:4px;padding:2px 6px;border-radius:999px;background:var(--surface-2,#f5f4f0);color:var(--subtle);font-size:.58rem;font-weight:800}
        .admin-sales-status.is-active{color:#2b6b4a;background:#edf6ef}
        .admin-sales-status.is-off{color:var(--subtle)}
        .admin-sales-number{font-variant-numeric:tabular-nums;color:var(--navy-900)!important;font-weight:800}
        .admin-sales-number.is-alert{color:var(--danger)!important}
        .admin-sales-number.is-warn{color:var(--brass-700)!important}
        .admin-sales-conversion{display:inline-flex;align-items:center;gap:4px;padding:4px 7px;border-radius:8px;background:var(--surface-2,#f7f5f0);color:var(--navy-900);font-weight:800}
        .admin-sales-action{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap}
        .admin-sales-action .text-link{white-space:nowrap}
        .admin-sales-mini{display:grid;gap:8px}
        .admin-sales-side-card{display:grid;gap:10px;padding:13px;border:1px solid var(--line);border-radius:14px;background:var(--card,#fff)}
        .admin-sales-side-card h3{margin:0;color:var(--navy-900);font-size:.8rem}
        .admin-sales-pipeline{display:grid;gap:7px}
        .admin-sales-pipeline-row{display:grid;grid-template-columns:52px minmax(0,1fr) 34px;gap:8px;align-items:center;font-size:.65rem}
        .admin-sales-pipeline-row span{color:var(--muted)}
        .admin-sales-pipeline-bar{height:7px;border-radius:999px;background:var(--surface-2,#f2f1ed);overflow:hidden}
        .admin-sales-pipeline-bar i{display:block;height:100%;border-radius:999px;background:var(--brass-600);min-width:2px}
        .admin-sales-pipeline-row strong{color:var(--navy-900);text-align:left}
        .admin-sales-filter{display:flex;align-items:center;gap:7px;padding:8px 10px;border:1px solid var(--line);border-radius:10px;background:var(--card,#fff);margin-bottom:8px}
        .admin-sales-filter input{width:100%;border:0;outline:0;background:transparent;color:var(--navy-900);font:inherit;font-size:.7rem}
        .admin-sales-check{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:.66rem;font-weight:800}
        .admin-sales-check input{accent-color:var(--brass-600)}
        .admin-sales-expanded td{background:var(--brass-50,#fbf7ef)!important}
        .admin-sales-detail{padding:4px 0 2px}
        .admin-sales-detail-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px}
        .admin-sales-detail-chip{display:grid;gap:3px;padding:7px 8px;border:1px solid var(--line);border-radius:9px;background:var(--card,#fff)}
        .admin-sales-detail-chip span{color:var(--subtle);font-size:.58rem}
        .admin-sales-detail-chip strong{color:var(--navy-900);font-size:.72rem}
        .admin-sales-empty{padding:30px 18px;display:grid;place-items:center;gap:8px;color:var(--subtle);text-align:center}
        .admin-sales-error{padding:10px 12px;border:1px solid rgb(163 49 39 / 22%);background:var(--danger-bg,#fff3f1);border-radius:12px;color:var(--danger);font-size:.72rem;margin-top:10px}
        .admin-sales-note{margin:9px 0 0;color:var(--subtle);font-size:.63rem;line-height:1.8}
        @media(max-width:1100px){.admin-sales-summary{grid-template-columns:repeat(3,minmax(0,1fr))}.admin-sales-body{grid-template-columns:1fr}}
        @media(max-width:700px){.admin-sales-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-sales-toolbar{width:100%}.admin-sales-toolbar .admin-sales-range{margin-left:auto}.admin-sales-table{min-width:760px}.admin-sales-detail-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
        @media(max-width:460px){.admin-sales-summary{grid-template-columns:1fr 1fr}.admin-sales-range button{padding:6px 8px}.admin-sales-detail-grid{grid-template-columns:1fr 1fr}}
      `}</style>

      <div className="admin-sales-head">
        <div className="admin-sales-title">
          <span className="kicker">مرکز کنترل فروش</span>
          <h2>هر مشاور، هر لید، هر پیگیری — در یک نگاه</h2>
          <p>صف عملیاتی تیم فروش بر اساس داده‌های واقعی CRM، فایل‌های منتشرشده و تعاملات ۷، ۳۰ یا ۹۰ روز اخیر.</p>
        </div>
        <div className="admin-sales-toolbar">
          <div className="admin-sales-range" aria-label="بازه گزارش">
            {[7, 30, 90].map((value) => (
              <button
                type="button"
                key={value}
                className={days === value ? "is-active" : ""}
                onClick={() => {
                  const next = value as 7 | 30 | 90;
                  setDays(next);
                  void load(next);
                }}
              >
                {value === 7 ? "۷ روز" : value === 30 ? "۳۰ روز" : "۹۰ روز"}
              </button>
            ))}
          </div>
          <button type="button" className="btn-ghost admin-sales-refresh" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "admin-spin" : ""} />
            بروزرسانی
          </button>
        </div>
      </div>

      {error ? <div className="admin-sales-error">{error}</div> : null}

      <div className="admin-sales-summary">
        <div className="admin-sales-summary-card" data-tone="attention"><span><UsersRound size={13} />مشاور فعال</span><strong>{fa(data?.summary.activeConsultants ?? 0)}</strong></div>
        <div className="admin-sales-summary-card" data-tone="attention"><span><Target size={13} />لید فعال</span><strong>{fa(data?.summary.activeLeads ?? 0)}</strong></div>
        <div className="admin-sales-summary-card" data-tone="urgent"><span><Clock3 size={13} />بدون پیگیری</span><strong>{fa(data?.summary.overdueLeads ?? 0)}</strong></div>
        <div className="admin-sales-summary-card" data-tone="attention"><span><CalendarClock size={13} />درخواست بازدید</span><strong>{fa(data?.summary.visitRequests ?? 0)}</strong></div>
        <div className="admin-sales-summary-card"><span><CheckCircle2 size={13} />قرارداد دوره</span><strong>{fa(data?.summary.contracts ?? 0)}</strong></div>
        <div className="admin-sales-summary-card"><span><Eye size={13} />بازدید فایل‌ها</span><strong>{fa(data?.summary.totalViews ?? 0)}</strong></div>
      </div>

      <div className="admin-sales-body">
        <div>
          <div className="admin-sales-filter">
            <Search size={15} color="currentColor" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="جست‌وجوی نام یا شماره مشاور..."
              aria-label="جست‌وجوی مشاور"
            />
          </div>
          <label className="admin-sales-check" style={{ marginBottom: 8 }}>
            <input type="checkbox" checked={onlyActive} onChange={(event) => setOnlyActive(event.target.checked)} />
            فقط مشاوران فعال
          </label>

          <div className="admin-sales-table-wrap">
            {loading && !data ? (
              <div className="admin-sales-empty"><RefreshCw size={24} className="admin-spin" /><strong>در حال آماده‌سازی مرکز کنترل فروش…</strong></div>
            ) : rows.length === 0 ? (
              <div className="admin-sales-empty"><UsersRound size={28} /><strong>مشاوری مطابق فیلتر پیدا نشد.</strong></div>
            ) : (
              <table className="admin-sales-table">
                <thead>
                  <tr>
                    <th>مشاور</th>
                    <th>فایل منتشرشده</th>
                    <th>لیدهای فعال</th>
                    <th>لید جدید ۷ روز</th>
                    <th>بدون پیگیری</th>
                    <th>بازدیدهای درخواستی</th>
                    <th>قرارداد</th>
                    <th>تبدیل لید</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => {
                    const expanded = expandedId === item.id;
                    return (
                      <tr key={item.id} className={expanded ? "admin-sales-expanded" : ""}>
                        <td>
                          <button
                            type="button"
                            onClick={() => setExpandedId(expanded ? null : item.id)}
                            style={{ border: 0, padding: 0, background: "transparent", textAlign: "right", cursor: "pointer" }}
                            aria-expanded={expanded}
                            aria-controls={"sales-detail-" + item.id}
                          >
                            <span className="admin-sales-consultant">
                              <span className="admin-sales-avatar"><UsersRound size={16} /></span>
                              <span>
                                <strong>{item.name || "مشاور بدون نام"}</strong>
                                <small>{item.phone || "—"}</small>
                                <span className={"admin-sales-status " + (item.active ? "is-active" : "is-off")}>
                                  {item.active ? "فعال" : "غیرفعال"}
                                </span>
                              </span>
                            </span>
                          </button>
                        </td>
                        <td className="admin-sales-number">{fa(item.files)}</td>
                        <td className={"admin-sales-number " + (item.activeLeads > 0 ? "is-warn" : "")}>{fa(item.activeLeads)}</td>
                        <td className="admin-sales-number">{fa(item.new7d)}</td>
                        <td className={"admin-sales-number " + (item.overdueLeads > 0 ? "is-alert" : "")}>{fa(item.overdueLeads)}</td>
                        <td className={"admin-sales-number " + (item.visitRequests > 0 ? "is-warn" : "")}>{fa(item.visitRequests)}</td>
                        <td className="admin-sales-number">{fa(item.periodContracts)}</td>
                        <td><span className="admin-sales-conversion">{pct(item.conversionRate)}</span></td>
                        <td>
                          <span className="admin-sales-action">
                            <button type="button" className="text-link" onClick={onOpenLeads}>لیدها <ArrowLeft size={12} /></button>
                            <button type="button" className="text-link" onClick={onOpenProperties}>فایل‌ها <BriefcaseBusiness size={12} /></button>
                            {item.phone ? <a className="text-link" href={"tel:" + item.phone}>تماس <Phone size={12} /></a> : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {rows.map((item) => {
            if (expandedId !== item.id) return null;
            return (
              <div key={item.id} id={"sales-detail-" + item.id} className="admin-sales-detail" style={{ marginTop: 8 }}>
                <div className="admin-sales-side-card">
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                    <div>
                      <h3>{item.name || "مشاور بدون نام"} · جزئیات عملیاتی</h3>
                      <p className="admin-sales-note">این مقادیر برای بازه انتخاب‌شده محاسبه شده‌اند؛ صف «بدون پیگیری» معیار SLA موجود پنل را دنبال می‌کند.</p>
                    </div>
                    <button type="button" className="btn-ghost" onClick={() => setExpandedId(null)}>بستن</button>
                  </div>
                  <div className="admin-sales-detail-grid">
                    <div className="admin-sales-detail-chip"><span>لید دوره</span><strong>{fa(item.periodLeads)}</strong></div>
                    <div className="admin-sales-detail-chip"><span>لید فعال</span><strong>{fa(item.activeLeads)}</strong></div>
                    <div className="admin-sales-detail-chip"><span>پیگیری ۷ روز</span><strong>{fa(item.nextFollowUps)}</strong></div>
                    <div className="admin-sales-detail-chip"><span>بازدید درخواستی</span><strong>{fa(item.visitRequests)}</strong></div>
                    <div className="admin-sales-detail-chip"><span>قرارداد دوره</span><strong>{fa(item.periodContracts)}</strong></div>
                    <div className="admin-sales-detail-chip"><span>کل قرارداد ثبت‌شده</span><strong>{fa(item.contracts)}</strong></div>
                    <div className="admin-sales-detail-chip"><span>بازدید فایل</span><strong>{fa(item.views)}</strong></div>
                  </div>
                  <div className="admin-sales-note" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                    <CheckCircle2 size={13} />
                    وضعیت صف: {priorityTone(item) === "urgent" ? "نیازمند رسیدگی فوری" : priorityTone(item) === "attention" ? "پیگیری نزدیک" : "صف بحرانی ندارد"} · نرخ تبدیل ثبت‌شده {pct(item.conversionRate)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <aside className="admin-sales-mini">
          <div className="admin-sales-side-card">
            <h3>قیف فروش در بازه انتخاب‌شده</h3>
            <div className="admin-sales-pipeline">
              {[
                ["جدید", data?.pipeline.new ?? 0],
                ["تماس", data?.pipeline.contacted ?? 0],
                ["پیگیری", data?.pipeline.follow_up ?? 0],
                ["بازدید", data?.pipeline.visited ?? 0],
                ["قرارداد", data?.pipeline.contract ?? 0],
              ].map(([label, value]) => {
                const numeric = Number(value);
                const max = Math.max(
                  1,
                  data?.pipeline.new ?? 0,
                  data?.pipeline.contacted ?? 0,
                  data?.pipeline.follow_up ?? 0,
                  data?.pipeline.visited ?? 0,
                  data?.pipeline.contract ?? 0,
                );
                return (
                  <div className="admin-sales-pipeline-row" key={String(label)}>
                    <span>{String(label)}</span>
                    <span className="admin-sales-pipeline-bar"><i style={{ width: Math.max(2, (numeric / max) * 100) + "%" }} /></span>
                    <strong>{fa(numeric)}</strong>
                  </div>
                );
              })}
            </div>
            <button type="button" className="btn-ghost" style={{ width: "100%", justifyContent: "center", marginTop: 4 }} onClick={onOpenLeads}>
              باز کردن CRM
              <ArrowLeft size={14} />
            </button>
          </div>

          <div className="admin-sales-side-card">
            <h3>راهنمای صف</h3>
            <div className="admin-sales-note"><Clock3 size={13} style={{ verticalAlign: "middle" }} /> «بدون پیگیری» یعنی لید عملیاتی بیش از ۲۴ ساعت بدون تماس/واتساپ/بازدید، مطابق منطق SLA پنل.</div>
            <div className="admin-sales-note"><CalendarClock size={13} style={{ verticalAlign: "middle" }} /> «بازدید درخواستی» از visit_status = requested در CRM جمع می‌شود.</div>
            <div className="admin-sales-note"><Eye size={13} style={{ verticalAlign: "middle" }} /> بازدیدها از رویداد property_view در بازه انتخاب‌شده محاسبه می‌شوند.</div>
          </div>
        </aside>
      </div>
    </section>
  );
}
