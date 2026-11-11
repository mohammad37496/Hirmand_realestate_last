import { useCallback, useEffect, useState } from "react";
import { RefreshCw, Save, Target, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { listAdminConsultants, type Consultant } from "@/lib/consultants";
import { addDecimalStrings } from "@/lib/decimal-money";
import { formatTomanExact } from "@/lib/money";

type Row = {
  id: string | null;
  consultant: string;
  leadTarget: number;
  contractTarget: number;
  volumeTarget: string; commissionTarget: string;
  leads: number;
  contracts: number;
  deals: number;
  volume: string; commissions: string;
  note: string;
};

const monthNow = () => {
  const date = new Date();
  return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
};
const fa = (value: number) => value.toLocaleString("fa-IR");
const pct = (actual: number, target: number) => target > 0 ? Math.min(100, Math.round(actual / target * 100)) : 0;

export function AdminConsultantTargets() {
  const [month, setMonth] = useState(monthNow());
  const [rows, setRows] = useState<Row[]>([]);
  const [consultants, setConsultants] = useState<Consultant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState({ consultant: "", leadTarget: "", contractTarget: "", volumeTarget: "", commissionTarget: "", note: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [response, team] = await Promise.all([
        fetch("/api/admin-consultant-targets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "list", month }),
        }),
        listAdminConsultants(),
      ]);
      const data = await response.json().catch(() => null) as { rows?: Row[]; statusMessage?: string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || "اهداف مشاوران دریافت نشد.");
      setRows(Array.isArray(data?.rows) ? data.rows : []);
      setConsultants(team);
      if (!form.consultant && team[0]) setForm((value) => ({ ...value, consultant: team[0].name }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "اهداف مشاوران دریافت نشد.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [month, form.consultant]);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    if (!form.consultant.trim()) return toast.error("مشاور را انتخاب کنید.");
    setSaving(true);
    try {
      const response = await fetch("/api/admin-consultant-targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", month, ...form }),
      });
      const data = await response.json().catch(() => null) as { statusMessage?: string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || "ذخیره هدف انجام نشد.");
      toast.success("هدف ماهانه ذخیره شد.");
      setForm((value) => ({ ...value, leadTarget: "", contractTarget: "", volumeTarget: "", commissionTarget: "", note: "" }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ذخیره هدف انجام نشد.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: string | null) {
    if (!id || !window.confirm("هدف این مشاور حذف شود؟")) return;
    try {
      const response = await fetch("/api/admin-consultant-targets", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", id }),
      });
      const data = await response.json().catch(() => null) as { statusMessage?: string } | null;
      if (!response.ok) throw new Error(data?.statusMessage || "حذف هدف انجام نشد.");
      toast.success("هدف حذف شد.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "حذف هدف انجام نشد.");
    }
  }

  const totals = rows.reduce((a, r) => ({
    leadTarget: a.leadTarget + r.leadTarget,
    contractTarget: a.contractTarget + r.contractTarget,
    volumeTarget: addDecimalStrings(a.volumeTarget,r.volumeTarget),
    commissionTarget: addDecimalStrings(a.commissionTarget,r.commissionTarget),
    leads: a.leads + r.leads,
    contracts: a.contracts + r.contracts,
    volume: addDecimalStrings(a.volume,r.volume),
    commissions: addDecimalStrings(a.commissions,r.commissions),
  }), { leadTarget: 0, contractTarget: 0, volumeTarget: "0", commissionTarget: "0", leads: 0, contracts: 0, volume: "0", commissions: "0" });

  return (
    <section className="admin-panel admin-consultant-targets" dir="rtl">
      <div className="admin-panel-head">
        <div><span className="kicker">مدیریت تیم</span><h2><Target size={18} /> اهداف ماهانه مشاوران</h2><p>برای هر مشاور هدف لید، قرارداد، حجم معامله و کمیسیون تعیین کنید و نتیجه واقعی همان ماه را کنار آن ببینید.</p></div>
        <div className="admin-target-toolbar"><input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><button className="btn-ghost" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> بروزرسانی</button></div>
      </div>

      {loadError ? <div className="admin-empty" role="alert">{loadError}<button className="btn-ghost" type="button" onClick={() => void load()} disabled={loading}>تلاش مجدد</button></div> : (
        <div className="admin-kpi-cards admin-performance-kpis">
          <div className="admin-kpi-card"><span>هدف لید</span><strong>{fa(totals.leadTarget)}</strong></div>
          <div className="admin-kpi-card"><span>لید واقعی</span><strong>{fa(totals.leads)}</strong></div>
          <div className="admin-kpi-card"><span>هدف قرارداد</span><strong>{fa(totals.contractTarget)}</strong></div>
          <div className="admin-kpi-card"><span>قرارداد واقعی</span><strong>{fa(totals.contracts)}</strong></div>
          <div className="admin-kpi-card"><span>هدف حجم معاملات</span><strong>{formatTomanExact(totals.volumeTarget)}</strong></div>
          <div className="admin-kpi-card"><span>حجم واقعی</span><strong>{formatTomanExact(totals.volume)}</strong></div>
        </div>
      )}

      <div className="admin-target-form">
        <label className="field"><span>مشاور</span><select value={form.consultant} onChange={(event) => setForm((value) => ({ ...value, consultant: event.target.value }))}>{consultants.map((consultant) => <option key={consultant.id} value={consultant.name}>{consultant.name}</option>)}</select></label>
        <label className="field"><span>هدف لید</span><input inputMode="numeric" value={form.leadTarget} onChange={(event) => setForm((value) => ({ ...value, leadTarget: event.target.value }))} /></label>
        <label className="field"><span>هدف قرارداد</span><input inputMode="numeric" value={form.contractTarget} onChange={(event) => setForm((value) => ({ ...value, contractTarget: event.target.value }))} /></label>
        <label className="field"><span>هدف حجم معاملات</span><input inputMode="numeric" value={form.volumeTarget} onChange={(event) => setForm((value) => ({ ...value, volumeTarget: event.target.value }))} /></label>
        <label className="field"><span>هدف کمیسیون</span><input inputMode="numeric" value={form.commissionTarget} onChange={(event) => setForm((value) => ({ ...value, commissionTarget: event.target.value }))} /></label>
        <button className="btn-gold" type="button" onClick={() => void save()} disabled={saving || loading || Boolean(loadError)}><Save size={15} />{saving ? "در حال ذخیره…" : "ذخیره هدف"}</button>
      </div>

      {loadError ? null : loading ? <div className="admin-empty">در حال محاسبه…</div> : !rows.length ? <div className="admin-empty"><Target size={24} /><strong>هنوز هدفی برای این ماه ثبت نشده است.</strong></div> : (
        <div className="admin-target-table-wrap"><table className="admin-target-table"><thead><tr><th>مشاور</th><th>لید</th><th>قرارداد</th><th>حجم معامله</th><th>کمیسیون</th><th>عملیات</th></tr></thead><tbody>{rows.map((r) => <tr key={r.consultant}><td><strong>{r.consultant}</strong></td><td><b>{fa(r.leads)} / {fa(r.leadTarget)}</b><span className="admin-target-progress"><i style={{ width: pct(r.leads, r.leadTarget) + "%" }} /></span></td><td><b>{fa(r.contracts)} / {fa(r.contractTarget)}</b><span className="admin-target-progress"><i style={{ width: pct(r.contracts, r.contractTarget) + "%" }} /></span></td><td><b>{formatTomanExact(r.volume)} / {formatTomanExact(r.volumeTarget)}</b></td><td><b>{formatTomanExact(r.commissions)} / {formatTomanExact(r.commissionTarget)}</b></td><td>{r.id ? <button className="admin-icon-btn danger" type="button" onClick={() => void remove(r.id)} title="حذف"><Trash2 size={14} /></button> : null}</td></tr>)}</tbody></table></div>
      )}
    </section>
  );
}
