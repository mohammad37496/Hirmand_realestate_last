import { Database, Download, History, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

type Verification = { verifiedAt: string; coreReady: boolean; tables: Array<{ table: string; exists: boolean; count: number }> };
type BackupHistoryItem = { id: number; kind: string; createdAt: string; tableCounts: Record<string, unknown> };
const TABLE_LABEL: Record<string, string> = { properties: "فایل‌ها", leads: "لیدها", leadActivities: "فعالیت‌های CRM", financeTransactions: "امور مالی", consultants: "مشاوران", attendance: "حضور و غیاب" };
function formatDate(value: string) { return new Date(value).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }); }
function rowsCount(item: BackupHistoryItem) { return Object.values(item.tableCounts).reduce((sum: number, value) => sum + (Number(value) || 0), 0); }

export function AdminBackupManager() {
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [verification, setVerification] = useState<Verification | null>(null);
  const [retentionDays, setRetentionDays] = useState("90");
  const [pruning, setPruning] = useState(false);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/admin-backup?mode=history", { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } });
      const data = await res.json().catch(() => ({})) as { backups?: BackupHistoryItem[]; statusMessage?: string };
      if (!res.ok) throw new Error(data.statusMessage || "تاریخچه پشتیبان دریافت نشد.");
      setHistory(Array.isArray(data.backups) ? data.backups : []);
    } catch (error) { toast.error(error instanceof Error ? error.message : "تاریخچه پشتیبان دریافت نشد."); }
    finally { setHistoryLoading(false); }
  }

  useEffect(() => { void loadHistory(); }, []);

  async function verifyBackup() {
    if (verifying) return; setVerifying(true);
    try {
      const res = await fetch("/api/admin-backup?mode=verify", { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } });
      const data = await res.json().catch(() => ({})) as Partial<Verification> & { statusMessage?: string };
      if (!res.ok) throw new Error(data?.statusMessage || "راستی‌آزمایی پشتیبان انجام نشد.");
      setVerification(data as Verification); toast.success(data.coreReady ? "ساختار اصلی پایگاه داده آماده است." : "ساختار پایگاه داده کامل نیست.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "راستی‌آزمایی پشتیبان انجام نشد."); }
    finally { setVerifying(false); }
  }

  async function backup() {
    if (busy) return; setBusy(true);
    try {
      const res = await fetch("/api/admin-backup", { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data?.statusMessage || "ساخت نسخه پشتیبان انجام نشد."); }
      const blob = await res.blob(); const url = URL.createObjectURL(blob); const a = document.createElement("a");
      a.href = url; a.download = "hirmand-admin-backup-" + new Date().toISOString().slice(0, 10) + ".json";
      document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      await loadHistory(); toast.success("نسخه پشتیبان دانلود شد و در تاریخچه ثبت شد.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "ساخت نسخه پشتیبان انجام نشد."); }
    finally { setBusy(false); }
  }

  async function pruneHistory() {
    if (pruning) return; setPruning(true);
    try {
      const res = await fetch("/api/admin-backup", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "prune", retentionDays: Number(retentionDays) }) });
      const data = await res.json().catch(() => ({})) as { deleted?: number; statusMessage?: string; message?: string };
      if (!res.ok) throw new Error(data.statusMessage || data.message || "پاک‌سازی سوابق انجام نشد.");
      await loadHistory(); toast.success((Number(data.deleted) || 0).toLocaleString("fa-IR") + " سابقه قدیمی پاک شد.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "پاک‌سازی سوابق انجام نشد."); }
    finally { setPruning(false); }
  }

  const latest = history[0] ?? null;

  return (
    <div className="admin-backup-page">
      <section className="admin-panel admin-backup-hero">
        <span className="admin-backup-icon"><ShieldCheck size={28} /></span>
        <div>
          <span className="kicker">امنیت و پشتیبان‌گیری</span>
          <h2>نسخه پشتیبان و تاریخچه خروجی‌ها</h2>
          <p>ساختار پایگاه داده را بررسی کنید، خروجی JSON بگیرید و سابقه خروجی‌های قبلی را ببینید. سوابق قدیمی نیز با نگهداری ۹۰، ۱۸۰ یا ۳۶۵ روز قابل پاک‌سازی هستند.</p>
          <div className="admin-backup-summary-line"><span>آخرین خروجی: <strong>{latest ? formatDate(latest.createdAt) : "هنوز ثبت نشده"}</strong></span>{latest ? <span>{rowsCount(latest).toLocaleString("fa-IR")} رکورد در آخرین خروجی</span> : null}</div>
        </div>
        <div className="admin-backup-actions">
          <button className="btn-ghost" type="button" onClick={() => void verifyBackup()} disabled={verifying}><RefreshCw size={15} className={verifying ? "admin-spin" : ""} />{verifying ? "در حال بررسی…" : "راستی‌آزمایی"}</button>
          <button className="btn-gold" type="button" onClick={() => void backup()} disabled={busy}><Download size={17} />{busy ? "در حال آماده‌سازی…" : "دانلود نسخه پشتیبان"}</button>
        </div>
      </section>

      <section className="admin-panel admin-backup-history">
        <div className="admin-panel-head"><div><span className="kicker">تاریخچه</span><h2><History size={18} /> خروجی‌های ثبت‌شده</h2></div><button className="btn-ghost" type="button" onClick={() => void loadHistory()} disabled={historyLoading}><RefreshCw size={14} className={historyLoading ? "admin-spin" : ""} /> تازه‌سازی</button></div>
        {historyLoading ? <div className="admin-empty">در حال دریافت تاریخچه…</div> : !history.length ? <div className="admin-empty"><History size={24} /><strong>هنوز نسخه پشتیبانی ثبت نشده است.</strong><p>بعد از اولین خروجی، زمان و تعداد رکوردها اینجا نگهداری می‌شود.</p></div> :
          <div className="admin-backup-history-list">{history.map((item) => <article key={item.id} className="admin-backup-history-row"><div className="admin-backup-history-icon"><Database size={17} /></div><div className="admin-backup-history-main"><strong>{item.kind === "json_export" ? "خروجی JSON" : item.kind}</strong><small>{formatDate(item.createdAt)}</small><p>{rowsCount(item).toLocaleString("fa-IR")} رکورد · {Object.entries(item.tableCounts).map(([key, value]) => key + ": " + (Number(value) || 0)).slice(0, 4).join(" · ")}</p></div></article>)}</div>
        }
      </section>

      <section className="admin-panel admin-backup-retention">
        <div className="admin-panel-head"><div><span className="kicker">نگهداری سوابق</span><h2>پاک‌سازی کنترل‌شده</h2></div><span className="admin-dashboard-summary">حداقل ۳۰ روز نگه داشته می‌شود</span></div>
        <div className="admin-backup-retention-controls"><label className="field"><span>حذف سوابق قدیمی‌تر از</span><select value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)}><option value="90">۹۰ روز</option><option value="180">۱۸۰ روز</option><option value="365">۳۶۵ روز</option></select></label><button type="button" className="btn-ghost" onClick={() => void pruneHistory()} disabled={pruning}><Trash2 size={15} />{pruning ? "در حال پاک‌سازی…" : "پاک‌سازی سوابق قدیمی"}</button></div>
      </section>

      {verification ? <section className="admin-panel"><div className="admin-panel-head"><div><span className="kicker">سلامت داده</span><h2>{verification.coreReady ? "ساختار اصلی تأیید شد" : "هشدار ساختاری"}</h2></div><span className="admin-dashboard-summary">{formatDate(verification.verifiedAt)}</span></div><div className="admin-system-grid">{verification.tables.map((item) => <div key={item.table}><span><Database size={13} /> {TABLE_LABEL[item.table] ?? item.table}</span><strong>{item.exists ? item.count.toLocaleString("fa-IR") : "—"}</strong><small>{item.exists ? "جدول در دسترس است" : "جدول موجود نیست"}</small></div>)}</div></section> : null}
    </div>
  );
}
