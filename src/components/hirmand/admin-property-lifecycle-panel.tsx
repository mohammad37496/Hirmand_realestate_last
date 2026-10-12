import { Clock3, RefreshCw, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type LifecycleItem = {
  id: string;
  slug: string;
  title: string;
  neighborhood: string;
  contactName: string;
  staleDays: number;
  missing: string[];
  priority: "urgent" | "high";
  hasOpenTask: boolean;
  updatedAt: string | null;
};

export function AdminPropertyLifecyclePanel() {
  const [items, setItems] = useState<LifecycleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createdTasks, setCreatedTasks] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/admin-property-lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "list" }),
      });
      if (!response.ok) throw new Error("lifecycle load failed");
      const result = (await response.json()) as { items?: LifecycleItem[] };
      setItems(result.items ?? []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createTasks = async () => {
    setCreating(true);
    try {
      const response = await fetch("/api/admin-property-lifecycle", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "createTasks" }),
      });
      if (!response.ok) throw new Error("task creation failed");
      const result = (await response.json()) as { items?: LifecycleItem[]; createdTasks?: number };
      setCreatedTasks(result.createdTasks ?? 0);
      setItems(result.items ?? []);
    } finally {
      setCreating(false);
    }
  };

  const urgent = items.filter((item) => item.priority === "urgent").length;
  const withMissing = items.filter((item) => item.missing.length > 0).length;

  return (
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div>
          <span className="kicker">چرخه عمر فایل</span>
          <h2>فایل‌های نیازمند تازه‌سازی</h2>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()} disabled={loading}>
          <RefreshCw size={15} />
          بررسی مجدد
        </button>
      </div>

      <div className="admin-dashboard-mini-grid">
        <div><span>نیاز فوری</span><strong>{urgent.toLocaleString("fa-IR")}</strong></div>
        <div><span>دارای نقص اطلاعات</span><strong>{withMissing.toLocaleString("fa-IR")}</strong></div>
        <div><span>کل صف</span><strong>{items.length.toLocaleString("fa-IR")}</strong></div>
      </div>

      <div className="admin-breakdown">
        {items.length === 0 ? (
          <div className="admin-empty">
            <CheckCircle2 size={24} />
            <strong>فایل بحرانی برای تازه‌سازی پیدا نشد</strong>
          </div>
        ) : items.slice(0, 8).map((item) => (
          <div key={item.id} className="admin-breakdown-row">
            <div>
              <span>{item.title}{item.neighborhood ? " · " + item.neighborhood : ""}</span>
              <strong>{item.staleDays.toLocaleString("fa-IR")} روز بدون بروزرسانی</strong>
            </div>
            <small>
              {item.missing.length ? "ناقص: " + item.missing.join("، ") : "نیازمند بازبینی قیمت/محتوا"}
              {item.hasOpenTask ? " · پیگیری ساخته شده" : ""}
            </small>
            <a className="text-link" href={"/properties/" + encodeURIComponent(item.slug)} target="_blank" rel="noreferrer">
              مشاهده
            </a>
          </div>
        ))}
      </div>

      <div style={{ padding: "12px 20px 18px", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" className="btn-gold" onClick={() => void createTasks()} disabled={creating || items.every((item) => item.hasOpenTask)}>
          <Clock3 size={16} />
          {creating ? "در حال ساخت پیگیری..." : "ساخت پیگیری برای فایل‌های قدیمی"}
        </button>
        {createdTasks > 0 ? <span className="admin-dashboard-summary">{createdTasks.toLocaleString("fa-IR")} پیگیری ساخته شد.</span> : null}
        {urgent > 0 ? <span className="admin-dashboard-summary"><AlertTriangle size={13} /> موارد فوری ابتدا بررسی شوند.</span> : null}
      </div>
    </section>
  );
}
