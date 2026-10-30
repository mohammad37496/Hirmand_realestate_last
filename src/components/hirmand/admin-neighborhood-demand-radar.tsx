import { Activity, RefreshCw, TrendingUp } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { AdminErrorBanner } from "@/components/hirmand/admin-ui";

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
  const [available, setAvailable] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    setAvailable(null);
    try {
      const response = await fetch("/api/admin-neighborhood-demand", { method: "POST" });
      const result = (await response.json()) as { available?: boolean; items?: Item[]; statusMessage?: string };
      if (!response.ok) throw new Error(result.statusMessage || "دریافت رادار تقاضا انجام نشد.");
      if (result.available !== true) {
        setAvailable(false);
        setItems([]);
        setLoadError("پایگاه داده در دسترس نیست؛ آمار تقاضای محله‌ها قابل بررسی نیست.");
        return;
      }
      setAvailable(true);
      setItems(Array.isArray(result.items) ? result.items : []);
    } catch (error) {
      setAvailable(false);
      setItems([]);
      setLoadError(error instanceof Error ? error.message : "دریافت رادار تقاضا انجام نشد.");
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

      {loadError ? <AdminErrorBanner message={loadError} onRetry={() => void load()} /> : null}
      <div className="admin-breakdown">
        {loading ? <div className="admin-empty">در حال دریافت آمار محله‌ها…</div> : available === true && !items.length ? (
          <div className="admin-empty">
            <Activity size={24} />
            <strong>هنوز داده کافی برای رادار تقاضا ثبت نشده است.</strong>
          </div>
        ) : available === true ? (
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
        ) : null}
      </div>
    </section>
  );
}
