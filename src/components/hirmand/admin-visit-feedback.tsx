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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-visit-feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!response.ok) throw new Error("بازخوردها دریافت نشد.");
      setData(await response.json() as { total: number; average: number; interested: number; recent: Feedback[] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "بازخوردها دریافت نشد.");
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

      <div className="admin-dashboard-mini-grid">
        <div><span>کل بازخورد</span><strong>{(data?.total ?? 0).toLocaleString("fa-IR")}</strong></div>
        <div><span>میانگین امتیاز</span><strong>{(data?.average ?? 0).toLocaleString("fa-IR")} از ۵</strong></div>
        <div><span>علاقه‌مند</span><strong>{(data?.interested ?? 0).toLocaleString("fa-IR")}</strong></div>
      </div>

      {loading && !data ? (
        <div className="admin-empty"><MessageSquareText size={24} /><strong>در حال دریافت بازخوردها…</strong></div>
      ) : !data?.recent.length ? (
        <div className="admin-empty"><MessageSquareText size={24} /><strong>هنوز بازخوردی ثبت نشده است.</strong></div>
      ) : (
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
      )}
    </section>
  );
}
