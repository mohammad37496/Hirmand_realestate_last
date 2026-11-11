import { Database, Download, History, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { readLastSuccessfulBackupVerification, writeLastSuccessfulBackupVerification } from "@/lib/admin-backup-last-success";

type Verification = { checkedAt: string; lastSuccessfulAt: string | null; status: "healthy" | "degraded" | "error" | "timeout"; coreReady: boolean; complete: boolean; tables: Array<{ table: string; status: "available" | "missing" | "error" | "timeout"; exists: boolean | null; count: number | null }> };
type BackupHistoryItem = { id: number; kind: string; createdAt: string; tableCounts: Record<string, unknown> };
const TABLE_LABEL: Record<string, string> = { properties: "فایل‌ها", leads: "لیدها", leadActivities: "فعالیت‌های CRM", financeTransactions: "امور مالی", consultants: "مشاوران", attendance: "حضور و غیاب", staffMobileDevices: "دستگاه‌های کارکنان", adminTasks: "وظایف مدیریت", propertyChangeHistory: "تاریخچه تغییر فایل", siteEvents: "رویدادهای سایت", backupHistory: "تاریخچه پشتیبان", adminAuditLog: "گزارش ممیزی مدیریت", admin_backup_log: "تاریخچه پشتیبان", admin_audit_log: "گزارش ممیزی مدیریت", admin_tasks: "وظایف مدیریت", property_change_history: "تاریخچه تغییر فایل", site_events: "رویدادهای سایت" };
function formatDate(value: string) { return new Date(value).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }); }
function rowsCount(item: BackupHistoryItem) { return Object.values(item.tableCounts).reduce((sum: number, value) => sum + (Number(value) || 0), 0); }

export function AdminBackupManager() {
  const [busy, setBusy] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [history, setHistory] = useState<BackupHistoryItem[]>([]);
  const [historyError, setHistoryError] = useState("");
  const [verification, setVerification] = useState<Verification | null>(null);
  const [lastSuccessfulAt, setLastSuccessfulAt] = useState<string | null>(null);
  const [verificationError, setVerificationError] = useState("");
  const [retentionDays, setRetentionDays] = useState("90");
  const [pruning, setPruning] = useState(false);

  async function loadHistory() {
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const res = await fetch("/api/admin-backup?mode=history", { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } });
      const data = await res.json().catch(() => ({})) as { backups?: BackupHistoryItem[]; statusMessage?: string };
      if (!res.ok) throw new Error(data.statusMessage || "تاریخچه پشتیبان دریافت نشد.");
      if (!Array.isArray(data.backups)) throw new Error("پاسخ تاریخچه پشتیبان ناقص است.");
      setHistory(data.backups);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : "تاریخچه پشتیبان دریافت نشد.";
      setHistoryError(message);
      toast.error(message);
      return false;
    }
    finally { setHistoryLoading(false); }
  }

  useEffect(() => {
    let storage: Storage | null = null;
    try { storage = window.localStorage; } catch { /* Browser storage can be disabled. */ }
    setLastSuccessfulAt(readLastSuccessfulBackupVerification(storage));
    void loadHistory();
  }, []);

  async function verifyBackup() {
    if (verifying) return; setVerifying(true); setVerificationError("");
    try {
      const res = await fetch("/api/admin-backup?mode=verify", { method: "GET", credentials: "same-origin", headers: { accept: "application/json" } });
      const data = await res.json().catch(() => ({})) as Partial<Verification> & { statusMessage?: string };
      if (!res.ok) throw new Error(data?.statusMessage || "راستی‌آزمایی پشتیبان انجام نشد.");
      if (!data.checkedAt || !Array.isArray(data.tables) || !data.status) throw new Error("پاسخ راستی‌آزمایی ناقص است.");
      const nextLastSuccessfulAt = data.status === "healthy" ? data.checkedAt : lastSuccessfulAt;
      if (data.status === "healthy") {
        let storage: Storage | null = null;
        try { storage = window.localStorage; } catch { /* Browser storage can be disabled. */ }
        writeLastSuccessfulBackupVerification(storage, data.checkedAt);
      }
      setLastSuccessfulAt(nextLastSuccessfulAt);
      setVerification({ ...(data as Verification), lastSuccessfulAt: nextLastSuccessfulAt });
      if (data.status === "healthy") toast.success("ساختار پایگاه داده کامل و در دسترس است.");
      else toast.error(data.status === "timeout" ? "مهلت بررسی پایگاه داده تمام شد." : data.status === "error" ? "بررسی ساختار پایگاه داده با خطا مواجه شد." : "ساختار پایگاه داده کامل نیست.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "راستی‌آزمایی پشتیبان انجام نشد.";
      setVerificationError(message);
      toast.error(message);
    }
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
      const historyRefreshed = await loadHistory();
      toast.success(historyRefreshed ? "نسخه پشتیبان دانلود و ثبت شد." : "نسخه پشتیبان دانلود شد؛ به‌روزرسانی تاریخچه قابل تأیید نیست.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "ساخت نسخه پشتیبان انجام نشد."); }
    finally { setBusy(false); }
  }

  async function pruneHistory() {
    if (pruning) return; setPruning(true);
    try {
      const res = await fetch("/api/admin-backup", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "prune", retentionDays: Number(retentionDays) }) });
      const data = await res.json().catch(() => ({})) as { deleted?: number; statusMessage?: string; message?: string };
      if (!res.ok) throw new Error(data.statusMessage || data.message || "پاک‌سازی سوابق انجام نشد.");
      const historyRefreshed = await loadHistory();
      toast.success((Number(data.deleted) || 0).toLocaleString("fa-IR") + (historyRefreshed ? " سابقه قدیمی پاک شد." : " سابقه پاک شد؛ به‌روزرسانی تاریخچه قابل تأیید نیست."));
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
          <p>ساختار جدول‌های عملیاتی منتخب را بررسی کنید و خروجی JSON بگیرید. این خروجی شامل اطلاعات احراز هویت، داده‌های خصوصی Phone Bridge یا فایل‌های باینری ذخیره‌شده در Object Storage نیست؛ برای بازیابی کامل زیرساخت، پشتیبان پایگاه داده و فضای ذخیره‌سازی نیز لازم است.</p>
          <div className="admin-backup-summary-line"><span>آخرین خروجی: <strong>{latest ? formatDate(latest.createdAt) : "هنوز ثبت نشده"}</strong></span>{latest ? <span>{rowsCount(latest).toLocaleString("fa-IR")} رکورد در آخرین خروجی</span> : null}{lastSuccessfulAt ? <span>آخرین راستی‌آزمایی موفق در این مرورگر: <strong>{formatDate(lastSuccessfulAt)}</strong></span> : null}</div>
        </div>
        <div className="admin-backup-actions">
          <button className="btn-ghost" type="button" onClick={() => void verifyBackup()} disabled={verifying}><RefreshCw size={15} className={verifying ? "admin-spin" : ""} />{verifying ? "در حال بررسی…" : "راستی‌آزمایی"}</button>
          <button className="btn-gold" type="button" onClick={() => void backup()} disabled={busy}><Download size={17} />{busy ? "در حال آماده‌سازی…" : "دانلود نسخه پشتیبان"}</button>
        </div>
      </section>

      <section className="admin-panel admin-backup-history">
        <div className="admin-panel-head"><div><span className="kicker">تاریخچه</span><h2><History size={18} /> خروجی‌های ثبت‌شده</h2></div><button className="btn-ghost" type="button" onClick={() => void loadHistory()} disabled={historyLoading}><RefreshCw size={14} className={historyLoading ? "admin-spin" : ""} /> تازه‌سازی</button></div>
        {historyLoading ? <div className="admin-empty">در حال دریافت تاریخچه…</div> : historyError ? <div className="admin-empty" role="alert"><strong>بارگذاری تاریخچه ناموفق بود.</strong><p>{historyError}</p><button type="button" className="btn-ghost" onClick={() => void loadHistory()}>تلاش دوباره</button></div> : !history.length ? <div className="admin-empty"><History size={24} /><strong>هنوز نسخه پشتیبانی ثبت نشده است.</strong><p>بعد از اولین خروجی، زمان و تعداد رکوردها اینجا نگهداری می‌شود.</p></div> :
          <div className="admin-backup-history-list">{history.map((item) => <article key={item.id} className="admin-backup-history-row"><div className="admin-backup-history-icon"><Database size={17} /></div><div className="admin-backup-history-main"><strong>{item.kind === "json_export" ? "خروجی JSON" : item.kind}</strong><small>{formatDate(item.createdAt)}</small><p>{rowsCount(item).toLocaleString("fa-IR")} رکورد · {Object.entries(item.tableCounts).map(([key, value]) => key + ": " + (Number(value) || 0)).slice(0, 4).join(" · ")}</p></div></article>)}</div>
        }
      </section>

      <section className="admin-panel admin-backup-retention">
        <div className="admin-panel-head"><div><span className="kicker">نگهداری سوابق</span><h2>پاک‌سازی کنترل‌شده</h2></div><span className="admin-dashboard-summary">حداقل ۳۰ روز نگه داشته می‌شود</span></div>
        <div className="admin-backup-retention-controls"><label className="field"><span>حذف سوابق قدیمی‌تر از</span><select value={retentionDays} onChange={(e) => setRetentionDays(e.target.value)}><option value="90">۹۰ روز</option><option value="180">۱۸۰ روز</option><option value="365">۳۶۵ روز</option></select></label><button type="button" className="btn-ghost" onClick={() => void pruneHistory()} disabled={pruning}><Trash2 size={15} />{pruning ? "در حال پاک‌سازی…" : "پاک‌سازی سوابق قدیمی"}</button></div>
      </section>

      {verificationError ? <section className="admin-panel" role="alert"><strong>راستی‌آزمایی ناموفق بود.</strong><p>{verificationError}</p><button type="button" className="btn-ghost" onClick={() => void verifyBackup()}>تلاش دوباره</button></section> : null}
      {verification ? <section className="admin-panel"><div className="admin-panel-head"><div><span className="kicker">سلامت داده</span><h2>{verification.status === "healthy" ? "ساختار کامل تأیید شد" : verification.status === "degraded" ? "ساختار پایگاه داده ناقص است" : verification.status === "timeout" ? "مهلت بررسی تمام شد" : "بررسی ساختار ناموفق بود"}</h2></div><span className="admin-dashboard-summary">زمان بررسی: {formatDate(verification.checkedAt)}{verification.lastSuccessfulAt ? " · آخرین بررسی موفق: " + formatDate(verification.lastSuccessfulAt) : " · بررسی موفقی ثبت نشده"}</span></div><div className="admin-system-grid">{verification.tables.map((item) => <div key={item.table}><span><Database size={13} /> {TABLE_LABEL[item.table] ?? item.table}</span><strong>{item.status === "available" && item.count != null ? item.count.toLocaleString("fa-IR") : "—"}</strong><small>{item.status === "available" ? "جدول در دسترس است" : item.status === "missing" ? "جدول موجود نیست" : item.status === "timeout" ? "مهلت بررسی تمام شد" : "بررسی جدول ناموفق بود"}</small></div>)}</div></section> : null}
    </div>
  );
}
