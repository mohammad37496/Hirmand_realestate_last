import { useEffect, useState } from "react";
import { Plus, RefreshCw, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { AdminErrorBanner } from "@/components/hirmand/admin-ui";

const fa = (value: number) => Number(value || 0).toLocaleString("fa-IR");
const money = (value: number) => `${fa(value)} تومان`;
type Status = "pending" | "approved" | "paid" | "cancelled";
type Row = { id: string; consultant: string; dealId: string | null; dealTitle: string | null; commissionAmount: number; consultantShare: number; officeShare: number; status: Status; paidAt: string | null; note: string };
type Deal = { id: string; title: string; consultant: string; commission: number };
type Summary = { pending: number; approved: number; paid: number; total: number };
const canMoveStatus = (current: Status, next: Status) => current === next || (current === "pending" && ["approved", "cancelled"].includes(next)) || (current === "approved" && ["paid", "cancelled"].includes(next)) || (current === "cancelled" && next === "pending");

export function AdminCommissionSettlement() {
  const [rows, setRows] = useState<Row[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [summary, setSummary] = useState<Summary>({ pending: 0, approved: 0, paid: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [form, setForm] = useState({ consultant: "", dealId: "", commission: "", consultantShare: "", note: "" });

  async function load() {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin-commission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "list" }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.statusMessage || "بارگذاری تسویه انجام نشد.");
      setRows(Array.isArray(payload.settlements) ? payload.settlements : []);
      setDeals(Array.isArray(payload.deals) ? payload.deals : []);
      setSummary(payload.summary ?? { pending: 0, approved: 0, paid: 0, total: 0 });
    } catch (error) {
      const message = error instanceof Error ? error.message : "بارگذاری تسویه انجام نشد.";
      setRows([]); setDeals([]); setSummary({ pending: 0, approved: 0, paid: 0, total: 0 }); setLoadError(message); toast.error(message);
    } finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, []);

  async function create() {
    if (saving) return;
    setSaving(true);
    try {
      const response = await fetch("/api/admin-commission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "create", ...form }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.statusMessage || "ثبت تسویه انجام نشد.");
      toast.success("تسویه در صف پرداخت ثبت شد.");
      setForm({ consultant: "", dealId: "", commission: "", consultantShare: "", note: "" });
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "ثبت تسویه انجام نشد."); }
    finally { setSaving(false); }
  }

  async function updateStatus(id: string, status: Status) {
    try {
      const response = await fetch("/api/admin-commission", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "status", id, status }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.statusMessage || "تغییر وضعیت تسویه انجام نشد.");
      setRows((current) => current.map((row) => row.id === id ? { ...row, status, paidAt: status === "paid" ? new Date().toISOString() : null } : row));
      toast.success("وضعیت تسویه به‌روزرسانی شد.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "تغییر وضعیت تسویه انجام نشد."); }
  }

  return <div className="admin-commission">
    {loadError ? <AdminErrorBanner message={loadError} onRetry={() => void load()} /> : <>
      <div className="admin-dashboard-mini-grid">
        <div><span>در انتظار</span><strong>{fa(summary.pending)}</strong></div>
        <div><span>تأییدشده</span><strong>{fa(summary.approved)}</strong></div>
        <div><span>پرداخت‌شده</span><strong>{fa(summary.paid)}</strong></div>
        <div><span>سهم قابل پرداخت</span><strong>{money(summary.total)}</strong></div>
      </div>
      <div className="admin-commission-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">تسویه</span><h2>تسویه کمیسیون مشاوران</h2></div><button className="btn-ghost" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> بروزرسانی</button></div>
          <div className="admin-form-grid">
            <label className="field"><span>مشاور</span><input value={form.consultant} onChange={(event) => setForm((current) => ({ ...current, consultant: event.target.value }))} /></label>
            <label className="field"><span>معامله مرتبط</span><select value={form.dealId} onChange={(event) => { const deal = deals.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, dealId: event.target.value, consultant: deal?.consultant || current.consultant, commission: deal ? String(deal.commission) : current.commission })); }}><option value="">بدون اتصال</option>{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title} · {deal.consultant} · {money(deal.commission || 0)}</option>)}</select></label>
            <label className="field"><span>کمیسیون کل</span><input inputMode="numeric" value={form.commission} onChange={(event) => setForm((current) => ({ ...current, commission: event.target.value }))} /></label>
            <label className="field"><span>سهم مشاور</span><input inputMode="numeric" value={form.consultantShare} onChange={(event) => setForm((current) => ({ ...current, consultantShare: event.target.value }))} /></label>
            <label className="field admin-span-2"><span>یادداشت</span><textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
          </div>
          <button className="btn-gold" type="button" onClick={() => void create()} disabled={saving || !form.consultant.trim() || !form.commission || !form.consultantShare}><Plus size={15} />{saving ? "در حال ثبت…" : "ثبت تسویه"}</button>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">صف پرداخت</span><h2>تسویه‌های اخیر</h2></div></div>
          <div className="admin-commission-list">
            {rows.map((row) => <article className="admin-commission-row" key={row.id}>
              <div><strong>{row.consultant}</strong><small>{row.dealTitle || "بدون معامله"} · کمیسیون {money(row.commissionAmount)} · سهم مشاور {money(row.consultantShare)}</small></div>
              <div><b>سهم دفتر {money(row.officeShare)}</b><small>{row.note || "—"}</small></div>
              <select value={row.status} onChange={(event) => void updateStatus(row.id, event.target.value as Status)}><option value="pending" disabled={!canMoveStatus(row.status, "pending")}>در انتظار</option><option value="approved" disabled={!canMoveStatus(row.status, "approved")}>تأیید شده</option><option value="paid" disabled={!canMoveStatus(row.status, "paid")}>پرداخت شد</option><option value="cancelled" disabled={!canMoveStatus(row.status, "cancelled")}>لغو شد</option></select>
            </article>)}
            {!rows.length && !loading ? <div className="admin-empty"><WalletCards size={25} /><strong>هنوز تسویه‌ای ثبت نشده.</strong></div> : null}
          </div>
        </section>
      </div>
    </>}
  </div>;
}
