import { Activity, RefreshCw, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Item = {
  neighborhood: string;
  files: number;
  views: number;
  favorites: number;
  calls: number;
  visits: number;
  leads: number;
  demandIndex: number;
  demandPercent: number;
};

export function AdminNeighborhoodDemandRadar() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-neighborhood-demand", { method: "POST" });
      if (!response.ok) throw new Error("demand radar failed");
      const result = (await response.json()) as { items?: Item[] };
      setItems(result.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="admin-panel" style={{ marginTop: 18 }}>
      <div className="admin-panel-head">
        <div>
          <span className="kicker">رادار تقاضا</span>
          <h2>نبض محله‌ها در ۳۰ روز اخیر</h2>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} />
          بروزرسانی
        </button>
      </div>

      <p className="admin-dashboard-summary" style={{ padding: "0 20px 8px" }}>
        شاخص داخلی هیرمند از ترکیب بازدید، ذخیره، تماس، درخواست بازدید و لید ساخته می‌شود و آمار رسمی بازار نیست.
      </p>

      <div className="admin-breakdown">
        {!items.length ? (
          <div className="admin-empty">
            <Activity size={24} />
            <strong>هنوز داده کافی برای رادار تقاضا ثبت نشده است.</strong>
          </div>
        ) : (
          items.slice(0, 10).map((item) => (
            <div key={item.neighborhood} className="admin-breakdown-row">
              <div style={{ minWidth: 0 }}>
                <span>{item.neighborhood}</span>
                <strong>{item.files.toLocaleString("fa-IR")} فایل · {item.leads.toLocaleString("fa-IR")} لید</strong>
                <div style={{ marginTop: 7, height: 7, borderRadius: 999, background: "var(--line)", overflow: "hidden" }}>
                  <span style={{ display: "block", height: "100%", width: item.demandPercent + "%", background: "var(--brass)", borderRadius: 999 }} />
                </div>
              </div>
              <small>
                {item.views.toLocaleString("fa-IR")} بازدید · {item.favorites.toLocaleString("fa-IR")} ذخیره · {item.calls.toLocaleString("fa-IR")} تماس · {item.visits.toLocaleString("fa-IR")} درخواست بازدید
              </small>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 800 }}>
                <TrendingUp size={14} />
                {item.demandIndex.toLocaleString("fa-IR")}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
