import { MessageSquareText, RefreshCw, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminErrorBanner } from "@/components/hirmand/admin-ui";
import { getVisitFeedbackDisplayState, type VisitFeedbackPayload } from "@/lib/admin-visit-feedback-state";

type Feedback = {
  id: string;
  rating: number;
  interest: string;
  note: string;
  createdAt: string;
  trackingToken: string;
  name: string;
  consultant: string;
  deal: string;
  propertyTitle: string;
  propertySlug: string;
};

type VisitFeedbackData = Omit<VisitFeedbackPayload, "recent"> & { recent: Feedback[] };

function faDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function AdminVisitFeedback() {
  const [data, setData] = useState<VisitFeedbackData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const response = await fetch("/api/admin-visit-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("بازخوردها دریافت نشد. دوباره تلاش کنید.");
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || !("available" in payload) || typeof payload.available !== "boolean" ||
          !("total" in payload) || typeof payload.total !== "number" || !("average" in payload) || typeof payload.average !== "number" ||
          !("interested" in payload) || typeof payload.interested !== "number" || !("recent" in payload) || !Array.isArray(payload.recent)) {
        throw new Error("ساختار پاسخ بازخوردها معتبر نیست. دوباره تلاش کنید.");
      }
      setData(payload as VisitFeedbackData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "بازخوردها دریافت نشد. دوباره تلاش کنید.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const displayState = getVisitFeedbackDisplayState(loading, data);
  const metricsAvailable = data?.available === true;

  return (
    <section className="admin-panel admin-visit-feedback">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">تجربه مشتری</span>
          <h2>بازخورد بازدیدها</h2>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} className={loading ? "admin-spin" : ""} /> بروزرسانی
        </button>
      </div>

      <div className="admin-dashboard-mini-grid">
        <div><span>کل بازخورد</span><strong>{metricsAvailable ? data.total.toLocaleString("fa-IR") : "—"}</strong></div>
        <div><span>میانگین امتیاز</span><strong>{metricsAvailable ? `${data.average.toLocaleString("fa-IR")} از ۵` : "—"}</strong></div>
        <div><span>علاقه‌مند</span><strong>{metricsAvailable ? data.interested.toLocaleString("fa-IR") : "—"}</strong></div>
      </div>

      {loadError && data ? <AdminErrorBanner message={loadError} onRetry={() => void load()} /> : null}
      {displayState === "loading" ? (
        <div className="admin-empty"><MessageSquareText size={24} /><strong>در حال دریافت بازخوردها…</strong></div>
      ) : displayState === "error" ? (
        <AdminErrorBanner message={loadError ?? "بازخوردها دریافت نشد. دوباره تلاش کنید."} onRetry={() => void load()} />
      ) : displayState === "unavailable" ? (
        <AdminErrorBanner message="داده‌های بازخورد به دلیل در دسترس نبودن پایگاه داده قابل نمایش نیستند." onRetry={() => void load()} />
      ) : displayState === "empty" ? (
        <div className="admin-empty"><MessageSquareText size={24} /><strong>هنوز بازخوردی ثبت نشده است.</strong></div>
      ) : (
        <div className="admin-breakdown">
          {data?.recent.map((item) => (
            <div key={item.id} className="admin-breakdown-row">
              <div style={{ minWidth: 0 }}>
                <span><strong>{item.name || "مشتری"}</strong>{item.propertyTitle ? " · " + item.propertyTitle : ""}</span>
                <small>{item.consultant ? "مشاور: " + item.consultant + " · " : ""}{faDate(item.createdAt)}</small>
                {item.note ? <p style={{ margin: "6px 0 0", lineHeight: 1.8 }}>{item.note}</p> : null}
              </div>
              <div className="admin-visit-feedback-score" aria-label={"امتیاز " + item.rating + " از ۵"}>
                <Star size={14} fill="currentColor" /> {item.rating.toLocaleString("fa-IR")}/۵
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
