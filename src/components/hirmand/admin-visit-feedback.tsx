import { MessageSquareText, RefreshCw, Star } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

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

function faDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fa-IR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
  } catch {
    return value;
  }
}

export function AdminVisitFeedback() {
  const [data, setData] = useState<{ total: number; average: number; interested: number; recent: Feedback[] } | null>(null);
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
      if (!response.ok) throw new Error("بازخوردها دریافت نشد.");
      setData(await response.json() as { total: number; average: number; interested: number; recent: Feedback[] });
    } catch (error) {
      const message = error instanceof Error ? error.message : "بازخوردها دریافت نشد.";
      setLoadError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

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

      {data ? (
        <div className="admin-dashboard-mini-grid">
          <div><span>کل بازخورد</span><strong>{data.total.toLocaleString("fa-IR")}</strong></div>
          <div><span>میانگین امتیاز</span><strong>{data.average.toLocaleString("fa-IR")} از ۵</strong></div>
          <div><span>علاقه‌مند</span><strong>{data.interested.toLocaleString("fa-IR")}</strong></div>
        </div>
      ) : null}

      {loading && !data ? (
        <div className="admin-empty"><MessageSquareText size={24} /><strong>در حال دریافت بازخوردها…</strong></div>
      ) : null}

      {loadError ? (
        <div className="admin-empty" role="alert">
          <MessageSquareText size={24} />
          <strong>بارگذاری بازخوردها ناموفق بود.</strong>
          <span>{loadError}</span>
          <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>تلاش دوباره</button>
        </div>
      ) : null}

      {!loading && !loadError && data && !data.recent.length ? (
        <div className="admin-empty"><MessageSquareText size={24} /><strong>هنوز بازخوردی ثبت نشده است.</strong></div>
      ) : null}

      {data?.recent.length ? (
        <div className="admin-breakdown">
          {data.recent.map((item) => (
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
      ) : null}
    </section>
  );
}
