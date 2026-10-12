import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";

type Finding = {
  id: number;
  kind: string;
  severity: "critical" | "warning" | "info";
  title: string;
  detail: string;
  entityType: string | null;
  entityId: string | null;
  detectedAt: string;
};

type ScanResponse = {
  scannedAt: string;
  summary: { critical: number; warning: number; info: number; open: number };
  findings: Finding[];
};

function fa(value: number) { return value.toLocaleString("fa-IR"); }
function faDate(value: string) { return new Date(value).toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" }); }

export function AdminDataHealth() {
  const [data, setData] = useState<ScanResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const scan = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-data-health", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "scan" }),
      });
      const payload = await response.json().catch(() => ({})) as ScanResponse & { statusMessage?: string };
      if (!response.ok) throw new Error(payload.statusMessage || "بررسی سلامت داده انجام نشد.");
      setData(payload);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بررسی سلامت داده انجام نشد.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void scan(); }, [scan]);

  async function resolve(id: number) {
    try {
      const response = await fetch("/api/admin-data-health", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "resolve", findingId: id }),
      });
      const payload = await response.json().catch(() => ({})) as { statusMessage?: string };
      if (!response.ok) throw new Error(payload.statusMessage || "بستن هشدار انجام نشد.");
      setData((current) => current ? {
        ...current,
        findings: current.findings.filter((item) => item.id !== id),
        summary: { ...current.summary, open: Math.max(0, current.summary.open - 1) },
      } : current);
      toast.success("هشدار به‌عنوان بررسی‌شده ثبت شد.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بستن هشدار انجام نشد.");
    }
  }

  return (
    <section className="admin-panel admin-data-health" aria-labelledby="admin-data-health-title">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">سلامت داده</span>
          <h2 id="admin-data-health-title"><ShieldAlert size={19} /> کنترل یکپارچگی اطلاعات</h2>
          <p className="admin-dashboard-summary">اتصال لید به فایل حذف‌شده، مشاور ناشناخته، تلفن تکراری، فایل پایه ناقص و مختصات ناقص را پیدا می‌کند.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void scan()} disabled={loading}>
          <RefreshCw size={14} className={loading ? "admin-spin" : ""} /> {loading ? "در حال اسکن…" : "اسکن دوباره"}
        </button>
      </div>
      {!data ? <div className="admin-empty">در حال آماده‌سازی اسکن…</div> : (
        <>
          <div className="admin-data-health-summary">
            <div className="is-critical"><span>بحرانی</span><strong>{fa(data.summary.critical)}</strong></div>
            <div className="is-warning"><span>هشدار</span><strong>{fa(data.summary.warning)}</strong></div>
            <div><span>اطلاعاتی</span><strong>{fa(data.summary.info)}</strong></div>
            <div><span>باز</span><strong>{fa(data.summary.open)}</strong></div>
          </div>
          {!data.findings.length ? (
            <div className="admin-data-health-ok"><CheckCircle2 size={19} /> هیچ ناسازگاری بازی گزارش نشده است.</div>
          ) : (
            <div className="admin-data-health-list">
              {data.findings.slice(0, 30).map((item) => (
                <article key={item.id} className={"admin-data-health-row severity-" + item.severity}>
                  <div className="admin-data-health-icon"><AlertTriangle size={17} /></div>
                  <div className="admin-data-health-main">
                    <strong>{item.title}</strong>
                    <small>{item.detail} · {faDate(item.detectedAt)}</small>
                    {item.entityType && item.entityId ? <code>{item.entityType}:{item.entityId}</code> : null}
                  </div>
                  <button type="button" className="btn-ghost" onClick={() => void resolve(item.id)}>بررسی شد</button>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
