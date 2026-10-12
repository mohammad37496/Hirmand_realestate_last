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
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
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
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "گزارش‌ها دریافت نشد.");
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
      toast.error(error instanceof Error ? error.message : "تغییر وضعیت گزارش انجام نشد.");
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
          <span className="admin-dashboard-summary">{openCount.toLocaleString("fa-IR")} گزارش باز</span>
          <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
            <RefreshCw size={15} className={loading ? "admin-spin" : ""} /> بروزرسانی
          </button>
        </div>
      </div>

      {loading && !reports.length ? (
        <div className="admin-empty"><AlertTriangle size={25} /><strong>در حال دریافت گزارش‌ها…</strong></div>
      ) : reports.length === 0 ? (
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
                    <button type="button" className="text-link" onClick={() => void setStatus(report.id, "resolved")} disabled={busyId === report.id}>
                      رفع شد
                    </button>
                  ) : null}
                  {report.status !== "dismissed" ? (
                    <button type="button" className="text-link" onClick={() => void setStatus(report.id, "dismissed")} disabled={busyId === report.id}>
                      نادیده بگیر
                    </button>
                  ) : null}
                  {report.status !== "open" ? (
                    <button type="button" className="text-link" onClick={() => void setStatus(report.id, "open")} disabled={busyId === report.id}>
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
