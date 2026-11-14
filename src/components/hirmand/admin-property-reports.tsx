import { AlertTriangle, Check, ExternalLink, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

type Report = {
  id: string;
  propertyId: string;
  propertySlug: string;
  propertyTitle: string;
  reportType: string;
  note: string;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
};

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function AdminPropertyReports() {
  const [reports, setReports] = useState<Report[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/property-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      if (!response.ok) throw new Error("گزارش‌ها دریافت نشد.");
      const data = await response.json() as { openCount?: number; reports?: Report[] };
      setOpenCount(Number(data.openCount) || 0);
      setReports(Array.isArray(data.reports) ? data.reports : []);
      setHasLoaded(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : "گزارش‌ها دریافت نشد.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(id: string, status: "resolved" | "dismissed" | "open") {
    setBusyId(id);
    try {
      const response = await fetch("/api/property-reports", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "updateStatus", id, status }),
      });
      if (!response.ok) throw new Error("تغییر وضعیت گزارش انجام نشد.");
      await load();
      toast.success(status === "resolved" ? "گزارش رفع‌شده ثبت شد." : status === "dismissed" ? "گزارش نادیده گرفته شد." : "گزارش دوباره باز شد.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "تغییر وضعیت گزارش انجام نشد.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="admin-panel" style={{ marginTop: 18 }}>
      <div className="admin-panel-head">
        <div>
          <span className="kicker">پشتیبانی فایل</span>
          <h2>گزارش‌های ایراد فایل</h2>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span className="admin-dashboard-summary">{loadError && !hasLoaded ? "اطلاعات در دسترس نیست" : `${openCount.toLocaleString("fa-IR")} گزارش باز${loadError ? " · داده قبلی" : ""}`}</span>
          <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "admin-spin" : ""} /> بروزرسانی
          </button>
        </div>
      </div>

      {loadError ? <div className="admin-empty" role="alert"><strong>گزارش‌های فایل در دسترس نیستند</strong><p>{loadError}{hasLoaded && reports.length ? " · آخرین داده‌های موفق نمایش داده می‌شوند." : ""}</p><button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}><RefreshCw size={14}/> تلاش مجدد</button></div> : null}

      {loading && !hasLoaded ? (
        <div className="admin-empty"><AlertTriangle size={25} /><strong>در حال دریافت گزارش‌ها…</strong></div>
      ) : loadError && !reports.length ? null : reports.length === 0 ? (
        <div className="admin-empty"><Check size={25} /><strong>هنوز گزارشی برای بررسی ثبت نشده است.</strong></div>
      ) : (
        <div className="admin-breakdown">
          {reports.map((report) => (
            <article key={report.id} className="admin-breakdown-row" style={{ alignItems: "flex-start" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: "flex", gap: 7, alignItems: "center", flexWrap: "wrap" }}>
                  <strong>{report.propertyTitle}</strong>
                  <span className={"admin-lead-status " + (report.status === "open" ? "status-new" : report.status === "resolved" ? "status-contract" : "status-closed")}>
                    {report.status === "open" ? "باز" : report.status === "resolved" ? "رفع‌شده" : "نادیده‌گرفته‌شده"}
                  </span>
                </div>
                <small>
                  {report.reportType} · {formatDate(report.createdAt)}
                </small>
                {report.note ? <p style={{ margin: "7px 0 0", lineHeight: 1.8 }}>{report.note}</p> : null}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <a className="text-link" href={"/properties/" + encodeURIComponent(report.propertySlug)} target="_blank" rel="noreferrer">
                    مشاهده فایل <ExternalLink size={13} />
                  </a>
                  {report.status !== "resolved" ? (
                    <button type="button" className="text-link" onClick={() => void setStatus(report.id, "resolved")} disabled={busyId === report.id || !!loadError}>
                      رفع شد
                    </button>
                  ) : null}
                  {report.status !== "dismissed" ? (
                    <button type="button" className="text-link" onClick={() => void setStatus(report.id, "dismissed")} disabled={busyId === report.id || !!loadError}>
                      نادیده بگیر
                    </button>
                  ) : null}
                  {report.status !== "open" ? (
                    <button type="button" className="text-link" onClick={() => void setStatus(report.id, "open")} disabled={busyId === report.id || !!loadError}>
                      بازکردن دوباره
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
