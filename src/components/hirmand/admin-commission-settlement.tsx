import { useEffect, useState } from "react";
import { Plus, RefreshCw, WalletCards } from "lucide-react";
import { toast } from "sonner";
import { formatTomanExact } from "@/lib/money";

const fa = (value: number) => value.toLocaleString("fa-IR");
const money = (value: string | number | null | undefined) => formatTomanExact(value);

type Status = "pending" | "approved" | "paid" | "cancelled";
type Row = {
  id: string;
  consultant: string;
  dealId: string | null;
  dealTitle: string | null;
  commissionAmount: string;
  consultantShare: string;
  officeShare: string;
  status: Status;
  paidAt: string | null;
  note: string;
};
type Deal = { id: string; title: string; consultant: string; commission: string; status: string; customerName: string };
type Summary = { pending: number; approved: number; paid: number; total: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isRow(value: unknown): value is Row {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.consultant === "string"
    && (value.dealId === null || typeof value.dealId === "string")
    && (value.dealTitle === null || typeof value.dealTitle === "string")
    && typeof value.commissionAmount === "string"
    && typeof value.consultantShare === "string"
    && typeof value.officeShare === "string"
    && typeof value.status === "string"
    && ["pending", "approved", "paid", "cancelled"].includes(value.status)
    && (value.paidAt === null || typeof value.paidAt === "string")
    && typeof value.note === "string";
}

function isDeal(value: unknown): value is Deal {
  return isRecord(value)
    && typeof value.id === "string"
    && typeof value.title === "string"
    && typeof value.consultant === "string"
    && typeof value.commission === "string"
    && typeof value.status === "string"
    && typeof value.customerName === "string";
}

function isSummary(value: unknown): value is Summary {
  return isRecord(value)
    && typeof value.pending === "number" && Number.isFinite(value.pending)
    && typeof value.approved === "number" && Number.isFinite(value.approved)
    && typeof value.paid === "number" && Number.isFinite(value.paid)
    && typeof value.total === "string";
}

const canMoveStatus = (current: Status, next: Status) => current === next
  || (current === "pending" && (next === "approved" || next === "cancelled"))
  || (current === "approved" && (next === "paid" || next === "cancelled"))
  || (current === "cancelled" && next === "pending");

export function AdminCommissionSettlement() {
  const [rows, setRows] = useState<Row[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [sum, setSum] = useState<Summary>({ pending: 0, approved: 0, paid: 0, total: "0" });
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ consultant: "", dealId: "", commission: "", consultantShare: "", note: "" });

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const response = await fetch("/api/admin-commission", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(isRecord(payload) && typeof payload.statusMessage === "string" ? payload.statusMessage : "بارگذاری صف تسویه انجام نشد.");
      if (!isRecord(payload) || !Array.isArray(payload.settlements) || !payload.settlements.every(isRow)
        || !Array.isArray(payload.deals) || !payload.deals.every(isDeal) || !isSummary(payload.summary)) {
        throw new Error("پاسخ صف تسویه معتبر نیست؛ آمار صفر قابل تأیید نیست.");
      }
      setRows(payload.settlements);
      setDeals(payload.deals);
      setSum(payload.summary);
      setLoaded(true);
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "بارگذاری صف تسویه انجام نشد.");
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!form.dealId) return toast.error("یک معامله قراردادی یا نهایی‌شده را انتخاب کنید.");
    setSaving(true);
    try {
      const response = await fetch("/api/admin-commission", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action: "create", ...form }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.success !== true) {
        throw new Error(isRecord(payload) && typeof payload.statusMessage === "string" ? payload.statusMessage : "ثبت تسویه انجام نشد.");
      }
      toast.success("تسویه در صف پرداخت ثبت شد.");
      setForm((current) => ({ ...current, consultant: "", dealId: "", commission: "", consultantShare: "", note: "" }));
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "ثبت تسویه انجام نشد.");
    } finally {
      setSaving(false);
    }
  };

  const status = async (id: string, value: Status) => {
    try {
      const response = await fetch("/api/admin-commission", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({ action: "status", id, status: value }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !isRecord(payload) || payload.success !== true) {
        throw new Error(isRecord(payload) && typeof payload.statusMessage === "string" ? payload.statusMessage : "تغییر وضعیت تسویه انجام نشد.");
      }
      setRows((current) => current.map((row) => row.id === id
        ? { ...row, status: value, paidAt: value === "paid" ? new Date().toISOString() : null }
        : row));
      toast.success("وضعیت تسویه به‌روزرسانی شد.");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تغییر وضعیت تسویه انجام نشد.");
      await load();
    }
  };

  if (!loaded && loading) {
    return <div className="admin-commission"><section className="admin-panel" role="status" aria-live="polite">در حال دریافت صف تسویه و خلاصه مالی…</section></div>;
  }

  if (!loaded && loadError) {
    return (
      <div className="admin-commission">
        <section className="admin-panel" role="alert">
          <strong>دریافت صف تسویه ناموفق بود.</strong>
          <p>{loadError}</p>
          <button className="btn-gold" type="button" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={14} className={loading ? "admin-spin" : undefined} /> تلاش دوباره
          </button>
        </section>
      </div>
    );
  }

  return (
    <div className="admin-commission">
      {loadError ? <section className="admin-panel" role="alert"><strong>به‌روزرسانی صف تسویه ناموفق بود؛ اطلاعات قبلی نمایش داده می‌شود.</strong><p>{loadError}</p><button className="btn-ghost" type="button" onClick={() => void load()} disabled={loading}>تلاش دوباره</button></section> : null}
      <div className="admin-dashboard-mini-grid">
        <div><span>در انتظار</span><strong>{fa(sum.pending)}</strong></div>
        <div><span>تأییدشده</span><strong>{fa(sum.approved)}</strong></div>
        <div><span>پرداخت‌شده</span><strong>{fa(sum.paid)}</strong></div>
        <div><span>سهم قابل پرداخت</span><strong>{money(sum.total)}</strong></div>
      </div>
      <div className="admin-commission-grid">
        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">تسویه</span><h2>تسویه کمیسیون مشاوران</h2></div><button className="btn-ghost" type="button" onClick={() => void load()} disabled={loading}><RefreshCw size={14} /> به‌روزرسانی</button></div>
          <div className="admin-form-grid">
            <label className="field"><span>مشاور</span><input value={form.consultant} onChange={(event) => setForm((current) => ({ ...current, consultant: event.target.value }))} /></label>
            <label className="field"><span>معامله مرتبط</span><select value={form.dealId} onChange={(event) => { const deal = deals.find((item) => item.id === event.target.value); setForm((current) => ({ ...current, dealId: event.target.value, consultant: deal?.consultant || current.consultant, commission: deal?.commission ? String(deal.commission) : current.commission })); }}><option value="" disabled>انتخاب معامله قراردادی یا نهایی‌شده</option>{deals.map((deal) => <option key={deal.id} value={deal.id}>{deal.title + " · " + deal.consultant + " · " + money(deal.commission || 0)}</option>)}</select></label>
            <label className="field"><span>کمیسیون کل</span><input inputMode="numeric" value={form.commission} onChange={(event) => setForm((current) => ({ ...current, commission: event.target.value }))} /></label>
            <label className="field"><span>سهم مشاور</span><input inputMode="numeric" value={form.consultantShare} onChange={(event) => setForm((current) => ({ ...current, consultantShare: event.target.value }))} /></label>
            <label className="field admin-span-2"><span>یادداشت</span><textarea value={form.note} onChange={(event) => setForm((current) => ({ ...current, note: event.target.value }))} /></label>
          </div>
          <button className="btn-gold" type="button" onClick={() => void create()} disabled={saving || !form.dealId}><Plus size={15} />{saving ? "در حال ثبت…" : "ثبت تسویه"}</button>
        </section>
        <section className="admin-panel">
          <div className="admin-panel-head"><div><span className="kicker">صف پرداخت</span><h2>تسویه‌های اخیر</h2></div></div>
          <div className="admin-commission-list">
            {rows.map((row) => <article className="admin-commission-row" key={row.id}>
              <div><strong>{row.consultant}</strong><small>{row.dealTitle || "بدون معامله"} · کمیسیون {money(row.commissionAmount)} · سهم مشاور {money(row.consultantShare)}</small></div>
              <div><b>سهم دفتر {money(row.officeShare)}</b><small>{row.note || "—"}</small></div>
              <select value={row.status} onChange={(event) => void status(row.id, event.target.value as Status)}>
                <option value="pending" disabled={!canMoveStatus(row.status, "pending")}>در انتظار</option>
                <option value="approved" disabled={!canMoveStatus(row.status, "approved")}>تأیید شده</option>
                <option value="paid" disabled={!canMoveStatus(row.status, "paid")}>پرداخت شد</option>
                <option value="cancelled" disabled={!canMoveStatus(row.status, "cancelled")}>لغو شد</option>
              </select>
            </article>)}
            {!rows.length && loaded && !loading && !loadError ? <div className="admin-empty"><WalletCards size={25} /><strong>هنوز تسویه‌ای ثبت نشده.</strong></div> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
